// src/database/importCatalog.ts
import { openDatabaseAsync } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy'; // ✅ IMPORTANTE en SDK 54
import { getDb } from './db';

type RowCatalogo = {
  item_id: number;
  nombre: string;
  ean: string | number | null;
};

function limpiarEan(raw: unknown): string {
  return String(raw ?? '').replace(/['"]/g, '').trim();
}

// Calcula dígito de control EAN-13 a partir de 12 dígitos
function completarEAN13(ean: string): string {
  if (/^\d{13}$/.test(ean)) return ean;
  if (!/^\d{12}$/.test(ean)) return ean;

  let sum = 0;
  // Pesos: pos 1,3,5... = 1 ; pos 2,4,6... = 3 (desde la izquierda)
  for (let i = 0; i < 12; i++) {
    const d = Number(ean[i]);
    const weight = i % 2 === 0 ? 1 : 3;
    sum += d * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return ean + String(check);
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
    if (!originalUri) {
      console.log('❌ no uri');
      return { ok: false as const, reason: 'no_uri' as const };
    }

    const sqliteDir = (FileSystem.documentDirectory ?? '') + 'SQLite/';
    if (!sqliteDir || !sqliteDir.startsWith('file://')) {
      throw new Error('No hay documentDirectory (¿no estás en Android/iOS con Expo Go?).');
    }

    const destinoUri = sqliteDir + 'catalog.db';

    console.log('📄 Archivo:', asset?.name ?? 'catalog.db', originalUri);
    console.log('📁 STEP=mkdir:', sqliteDir);
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });

    const old = await FileSystem.getInfoAsync(destinoUri);
    if (old.exists) {
      console.log('🧹 borrando catalog.db anterior...');
      await FileSystem.deleteAsync(destinoUri, { idempotent: true });
    }

    console.log('📥 STEP=copy ->', destinoUri);
    await FileSystem.copyAsync({ from: originalUri, to: destinoUri });

    const copied = await FileSystem.getInfoAsync(destinoUri);
    console.log('📦 Copiado exists=', copied.exists, 'uri=', copied.uri);
    if (!copied.exists) throw new Error('La copia no se realizó.');

    // ✅ Abre el DB externo (Expo SQLite busca en documentDirectory/SQLite por nombre)
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

    const localDb = await getDb();

    console.log('💾 STEP=insert local');
    await localDb.execAsync('BEGIN');
    try {
      await localDb.execAsync('DELETE FROM productos;');

      const insertSql = `INSERT INTO productos (item_id, nombre, ean) VALUES (?, ?, ?)`;

      for (const it of filas) {
        const eanBase = limpiarEan(it.ean);
        const eanFinal = completarEAN13(eanBase); // ✅ aquí se “agrega” el último dígito si faltaba
        await localDb.runAsync(insertSql, [it.item_id, it.nombre ?? '', eanFinal]);
      }

      await localDb.execAsync('COMMIT');
    } catch (e) {
      await localDb.execAsync('ROLLBACK');
      throw e;
    }

    console.log('✅ Importación completada.');
    return { ok: true as const, count: filas.length };
  } catch (e: any) {
    console.error('❌ Error en importarCatalogoDesdeArchivo:', e);
    return { ok: false as const, reason: 'error' as const, message: String(e?.message ?? e) };
  }
}
