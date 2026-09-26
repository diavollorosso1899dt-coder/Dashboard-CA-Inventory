import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, updateCachedMasterItem } from '@/lib/supabase/server';
import { setItemImageOverride } from '@/lib/assetImageHelper';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 100 * 1024; // 100 KB strict limit

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const itemName = (formData.get('itemName') as string)?.trim();

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'File gambar wajib diunggah.' },
        { status: 400 }
      );
    }

    if (!itemName) {
      return NextResponse.json(
        { success: false, message: 'Nama item aset wajib diisi.' },
        { status: 400 }
      );
    }

    // Validasi ketat batas 100 KB
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          success: false,
          message: `Ukuran file (${(file.size / 1024).toFixed(1)} KB) melebihi batas maksimal 100 KB. Pastikan kompresi berhasil.`,
        },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, message: 'Koneksi Supabase belum terkonfigurasi pada server.' },
        { status: 500 }
      );
    }

    // Tentukan nama file unik
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'webp';
    const cleanSlug = itemName
      .toLowerCase()
      .replace(/[^\w]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);
    const storagePath = `custom/${cleanSlug}_${Date.now()}.${fileExt}`;

    // 1. Upload ke Supabase Storage Bucket 'item-images'
    const { data: uploadData, error: uploadError } = await admin.storage
      .from('item-images')
      .upload(storagePath, buffer, {
        contentType: file.type || 'image/webp',
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase Storage Upload Error:', uploadError);
      return NextResponse.json(
        { success: false, message: `Gagal upload ke Supabase Storage: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Dapatkan Public URL
    const { data: publicUrlData } = admin.storage.from('item-images').getPublicUrl(storagePath);
    const publicUrl = publicUrlData.publicUrl;

    // 2. Simpan atau perbarui manifest di Supabase Storage
    try {
      let manifest: Record<string, string> = {};
      const { data: manifestBlob } = await admin.storage.from('item-images').download('manifest.json');
      if (manifestBlob) {
        const manifestText = await manifestBlob.text();
        manifest = JSON.parse(manifestText);
      }
      manifest[itemName] = publicUrl;
      await admin.storage
        .from('item-images')
        .upload('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), {
          contentType: 'application/json',
          upsert: true,
        });
    } catch (manifestErr) {
      console.warn('Could not update Supabase manifest.json:', manifestErr);
    }

    // 3. Simpan dan perbarui tabel asset_requests di database Supabase (wajib tersimpan permanen di DB)
    try {
      const { data: updatedRows } = await admin
        .from('asset_requests')
        .update({ photo_url: publicUrl, updated_at: new Date().toISOString() })
        .ilike('item_name', itemName)
        .select('id');

      if (!updatedRows || updatedRows.length === 0) {
        // Cek apakah ada kecocokan parsial atau perlu dibuat baris master baru di database
        const cleanSlug = itemName.toLowerCase().replace(/[^\w]/g, '_').replace(/_+/g, '_').slice(0, 40);
        const { data: partialMatch } = await admin
          .from('asset_requests')
          .select('id, item_name')
          .ilike('item_name', `%${itemName.trim().slice(0, 20)}%`)
          .limit(10);

        if (partialMatch && partialMatch.length > 0) {
          for (const row of partialMatch) {
            await admin
              .from('asset_requests')
              .update({ photo_url: publicUrl, updated_at: new Date().toISOString() })
              .eq('id', row.id);
          }
        } else {
          // Buat entri baru di tabel asset_requests agar selalu tercatat di database Supabase
          const extId = `MASTER-${cleanSlug}-${Date.now().toString().slice(-6)}`;
          await admin.from('asset_requests').insert({
            external_id: extId,
            region: 'JABODETABEK',
            branch_name: 'MASTER CATALOG',
            category: 'Master Item',
            classification: 'Perlengkapan Tetap',
            item_name: itemName,
            system_item_name: itemName,
            photo_url: publicUrl,
            quantity_needed: 1,
            stock_status: 'Ready (Spek Sesuai)',
            procurement_status: 'selesai',
            item_delivery_status: 'Lengkap',
            is_manually_edited: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      // Sinkronkan juga ke request_orders jika item ini pernah diajukan di RO
      const { data: matchingRos } = await admin
        .from('request_orders')
        .select('id, items')
        .not('items', 'is', null);

      if (matchingRos && matchingRos.length > 0) {
        for (const ro of matchingRos) {
          if (Array.isArray(ro.items)) {
            let changed = false;
            const newItems = ro.items.map((it: any) => {
              if (
                it.item_name &&
                it.item_name.toLowerCase().trim() === itemName.toLowerCase().trim()
              ) {
                changed = true;
                return { ...it, photo_url: publicUrl };
              }
              return it;
            });
            if (changed) {
              await admin
                .from('request_orders')
                .update({ items: newItems, updated_at: new Date().toISOString() })
                .eq('id', ro.id);
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn('Could not update asset_requests / request_orders table:', dbErr);
    }

    // 4. Update file lokal masterAssetImageMap.json agar aplikasi langsung membaca tanpa delay
    try {
      const mapPath = path.join(process.cwd(), 'src', 'data', 'masterAssetImageMap.json');
      if (fs.existsSync(mapPath)) {
        const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        if (!rawMap.exact) rawMap.exact = {};
        if (!rawMap.normalized) rawMap.normalized = {};

        rawMap.exact[itemName] = publicUrl;

        const cleanKey = itemName
          .toLowerCase()
          .replace(/\((jadul|sampel|sample|contoh)\)/gi, '')
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanKey) {
          rawMap.normalized[cleanKey] = publicUrl;
        }

        fs.writeFileSync(mapPath, JSON.stringify(rawMap, null, 2));
      }
    } catch (localMapErr) {
      console.warn('Could not update local masterAssetImageMap.json:', localMapErr);
    }

    // 5. Update runtime server cache segera
    setItemImageOverride(itemName, publicUrl);
    updateCachedMasterItem(itemName, { photoUrl: publicUrl });

    return NextResponse.json({
      success: true,
      message: `Gambar untuk "${itemName}" berhasil di-upload dan disimpan di Supabase!`,
      imageUrl: publicUrl,
      itemName,
      sizeBytes: file.size,
    });
  } catch (err: any) {
    console.error('Upload image API error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Terjadi kesalahan saat memproses gambar.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, customImages: {} });
    }

    const { data: manifestBlob, error } = await admin.storage
      .from('item-images')
      .download('manifest.json');

    if (error || !manifestBlob) {
      return NextResponse.json({ success: true, customImages: {} });
    }

    const manifestText = await manifestBlob.text();
    const manifest = JSON.parse(manifestText);
    return NextResponse.json({ success: true, customImages: manifest });
  } catch (err: any) {
    return NextResponse.json({ success: false, customImages: {}, error: err.message });
  }
}
