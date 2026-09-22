import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
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

    // 1. Update runtime in-memory helper
    setItemSpecificationOverride(itemName, specification);

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

    // 3. Update Supabase asset_requests table if row exists
    const admin = getAdminClient();
    if (admin) {
      try {
        await admin
          .from('asset_requests')
          .update({
            specification: specification,
            is_manually_edited: true,
            updated_at: new Date().toISOString(),
          })
          .ilike('item_name', itemName);
      } catch (dbErr) {
        console.warn('Could not update asset_requests table:', dbErr);
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
