// src/database/importCatalog.ts
import { openDatabaseAsync } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getDb } from './db';

type RowCatalogo = {
  item_id: number;
  nombre: string;
  ean: string;
};

export type ImportProgress =
  | { step: 'picker' }
  | { step: 'mkdir'; path: string }
  | { step: 'copy'; to: string }
  | { step: 'tables' }
  | { step: 'select' }
  | { step: 'insert'; current: number; total: number };

type ImportResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'canceled' | 'no_uri' | 'missing_tables'; tables?: string[] };

function baseDir(): string {
  // legacy normalmente NO es null en Expo Go
  const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!dir) throw new Error('No hay documentDirectory/cacheDirectory (¿web?). Usa Android/iOS con Expo Go.');
  return dir;
}

export async function importarCatalogoDesdeArchivo(
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  try {
    console.log('📁 STEP=picker: abriendo selector...');
    onProgress?.({ step: 'picker' });

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      console.log('⏹️ cancelado');
      return { ok: false, reason: 'canceled' };
    }

    const asset = result.assets?.[0];
    const originalUri = asset?.uri;
    if (!originalUri) return { ok: false, reason: 'no_uri' };

    console.log('📄 Archivo:', asset?.name, originalUri);

    const sqliteDir = baseDir() + 'SQLite/';
    const destinoUri = sqliteDir + 'catalog.db';

    console.log('📁 STEP=mkdir:', sqliteDir);
    onProgress?.({ step: 'mkdir', path: sqliteDir });
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });

    const exists = await FileSystem.getInfoAsync(destinoUri);
    if (exists.exists) {
      console.log('🧹 borrando catalog.db anterior...');
      await FileSystem.deleteAsync(destinoUri, { idempotent: true });
    }

    console.log('📥 STEP=copy ->', destinoUri);
    onProgress?.({ step: 'copy', to: destinoUri });
    await FileSystem.copyAsync({ from: originalUri, to: destinoUri });

    const info = await FileSystem.getInfoAsync(destinoUri);
    console.log('📦 Copiado exists=', info.exists, 'uri=', info.uri);

    console.log('📂 STEP=open ext db: catalog.db');
    const externalDB = await openDatabaseAsync('catalog.db');

    console.log('🔎 STEP=tables');
    onProgress?.({ step: 'tables' });
    const tables = await externalDB.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
    );
    const nombres = tables.map(t => t.name);
    console.log('📋 Tablas (primeras 25):', nombres.slice(0, 25));

    if (!nombres.includes('Item') || !nombres.includes('ItemEAN')) {
      return { ok: false, reason: 'missing_tables', tables: nombres };
    }

    console.log('🔍 STEP=select');
    onProgress?.({ step: 'select' });
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
      const total = filas.length;

      let i = 0;
      for (const it of filas) {
        const eanTexto = String(it.ean).replace(/['"]/g, '').trim();
        await localDb.runAsync(insertSql, [it.item_id, it.nombre, eanTexto]);

        i++;
        // actualiza UI cada 500 (ajústalo si quieres)
        if (i % 500 === 0) {
          onProgress?.({ step: 'insert', current: i, total });
          await new Promise(r => setTimeout(r, 0)); // deja respirar a la UI
        }
      }

      onProgress?.({ step: 'insert', current: total, total });

      await localDb.execAsync('COMMIT');
      return { ok: true, count: total };
    } catch (e) {
      await localDb.execAsync('ROLLBACK');
      throw e;
    }
  } catch (e) {
    console.error('❌ Error en importarCatalogoDesdeArchivo:', e);
    throw e;
  }
}
