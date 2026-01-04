// src/database/importCatalog.ts
import { openDatabaseAsync } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy'; // o 'expo-file-system/legacy' si tú lo usas así
import { getDb } from './db';

type RowCatalogo = {
  item_id: number;
  nombre: string;
  ean: string;
};

function baseDir(): string {
  // Workaround types: en runtime existe en Android/iOS
  const fs = FileSystem as unknown as {
    documentDirectory?: string | null;
    cacheDirectory?: string | null;
  };

  const dir = fs.documentDirectory ?? fs.cacheDirectory;
  if (!dir) throw new Error('No hay documentDirectory/cacheDirectory (¿web?). Usa Android/iOS.');
  return dir;
}

// ✅ Si viene 12 -> calcula check digit y lo vuelve 13
export function completarEAN13(raw: string): string {
  const digits = String(raw).replace(/\D/g, '');

  if (/^\d{13}$/.test(digits)) return digits;

  if (/^\d{12}$/.test(digits)) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = Number(digits[i]);
      sum += d * (i % 2 === 0 ? 1 : 3); // pos 1,3,5.. x1 ; pos 2,4,6.. x3
    }
    const check = (10 - (sum % 10)) % 10;
    return digits + String(check);
  }

  // fallback (si viniera raro)
  return digits;
}

export async function importarCatalogoDesdeArchivo() {
  try {
    console.log('📁 STEP=picker: abriendo selector...');

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      console.log('⏹️ cancelado');
      return { ok: false as const, reason: 'canceled' as const };
    }

    const asset = result.assets?.[0];
    const originalUri = asset?.uri;
    const name = asset?.name ?? 'catalog.db';

    if (!originalUri) {
      console.log('❌ no_uri');
      return { ok: false as const, reason: 'no_uri' as const };
    }

    console.log('📄 Archivo:', name, originalUri);

    const sqliteDir = baseDir() + 'SQLite/';
    const destinoUri = sqliteDir + 'catalog.db';

    console.log('📁 STEP=mkdir:', sqliteDir);
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });

    const exists = await FileSystem.getInfoAsync(destinoUri);
    if (exists.exists) {
      console.log('🧹 borrando catalog.db anterior...');
      await FileSystem.deleteAsync(destinoUri, { idempotent: true });
    }

    console.log('📥 STEP=copy ->', destinoUri);
    await FileSystem.copyAsync({ from: originalUri, to: destinoUri });

    const info = await FileSystem.getInfoAsync(destinoUri);
    console.log('📦 Copiado exists=', info.exists, 'uri=', info.uri);

    console.log('📂 STEP=open ext db: catalog.db');
    const externalDB = await openDatabaseAsync('catalog.db');

    console.log('🔎 STEP=tables');
    const tables = await externalDB.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
    );
    const nombres = tables.map(t => t.name);
    console.log('📋 Tablas (primeras 25):', nombres.slice(0, 25));

    if (!nombres.includes('Item') || !nombres.includes('ItemEAN')) {
      return { ok: false as const, reason: 'missing_tables' as const, tables: nombres };
    }

    console.log('🔍 STEP=select');
    const filas = await externalDB.getAllAsync<RowCatalogo>(`
      SELECT
        Item.ItemID AS item_id,
        Item.LoyaltyDescription AS nombre,
        ItemEAN.EAN AS ean
      FROM Item
      JOIN ItemEAN ON Item.ItemID = ItemEAN.ItemID;
    `);

    console.log('✅ Filas obtenidas:', filas.length);

    console.log('💾 STEP=insert local');
    const localDb = await getDb();

    await localDb.execAsync('BEGIN');
    try {
      await localDb.execAsync('DELETE FROM productos;');

      const insertSql = `INSERT INTO productos (item_id, nombre, ean) VALUES (?, ?, ?)`;

      for (const it of filas) {
        const eanNorm = completarEAN13(it.ean);
        // si queda vacío, lo saltamos
        if (!eanNorm) continue;

        await localDb.runAsync(insertSql, [it.item_id, it.nombre, eanNorm]);
      }

      await localDb.execAsync('COMMIT');
      return { ok: true as const, count: filas.length };
    } catch (e) {
      await localDb.execAsync('ROLLBACK');
      throw e;
    }
  } catch (e: any) {
    console.error('❌ Error en importarCatalogoDesdeArchivo:', e);
    return { ok: false as const, reason: 'error' as const, error: String(e?.message ?? e) };
  }
}
