import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, updateCachedMasterItem } from '@/lib/supabase/server';
import { setItemSpecificationOverride } from '@/lib/assetSpecHelper';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const itemName = (body.itemName as string)?.trim();
    const specification = (body.specification as string)?.trim() || '';

    if (!itemName) {
      return NextResponse.json(
        { success: false, message: 'Nama item aset wajib diisi.' },
        { status: 400 }
      );
    }

    // 1. Update runtime in-memory helper & server master catalog
    setItemSpecificationOverride(itemName, specification);
    updateCachedMasterItem(itemName, { specification });

    // 2. Persist to local JSON file src/data/itemSpecifications.json
    try {
      const filePath = path.join(process.cwd(), 'src', 'data', 'itemSpecifications.json');
      let currentMap: Record<string, string> = {};
      if (fs.existsSync(filePath)) {
        try {
          currentMap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {}
      }
      currentMap[itemName] = specification;
      fs.writeFileSync(filePath, JSON.stringify(currentMap, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Could not write to local itemSpecifications.json:', fsErr);
    }

    // 3. Simpan dan perbarui tabel asset_requests di database Supabase secara permanen
    const admin = getAdminClient();
    if (admin) {
      try {
        const { data: updatedRows } = await admin
          .from('asset_requests')
          .update({
            specification: specification,
            is_manually_edited: true,
            updated_at: new Date().toISOString(),
          })
          .ilike('item_name', itemName)
          .select('id');

        if (!updatedRows || updatedRows.length === 0) {
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
                .update({
                  specification: specification,
                  is_manually_edited: true,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', row.id);
            }
          } else {
            const extId = `MASTER-${cleanSlug}-${Date.now().toString().slice(-6)}`;
            await admin.from('asset_requests').insert({
              external_id: extId,
              region: 'JABODETABEK',
              branch_name: 'MASTER CATALOG',
              category: 'Master Item',
              classification: 'Perlengkapan Tetap',
              item_name: itemName,
              system_item_name: itemName,
              specification: specification,
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

        // Sinkronkan juga ke request_orders jika item ini ada di RO
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
                  return { ...it, specification };
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

      // 4. Backup to Supabase Storage bucket 'item-images'
      try {
        let cloudSpecs: Record<string, string> = {};
        const { data: specBlob } = await admin.storage
          .from('item-images')
          .download('item-specifications.json');
        if (specBlob) {
          const text = await specBlob.text();
          cloudSpecs = JSON.parse(text);
        }
        cloudSpecs[itemName] = specification;
        await admin.storage
          .from('item-images')
          .upload('item-specifications.json', Buffer.from(JSON.stringify(cloudSpecs, null, 2)), {
            contentType: 'application/json',
            upsert: true,
          });
      } catch (storageErr) {
        console.warn('Could not backup specifications to Supabase Storage:', storageErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Spesifikasi untuk "${itemName}" berhasil disimpan dan disinkronkan ke Supabase!`,
      itemName,
      specification,
    });
  } catch (err: any) {
    console.error('Error updating item specification:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Terjadi kesalahan saat menyimpan spesifikasi.' },
      { status: 500 }
    );
  }
}
