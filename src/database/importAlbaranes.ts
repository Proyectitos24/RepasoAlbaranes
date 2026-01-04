import { openDatabaseAsync } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { crearTablasAlbaranes } from './setup';
import { getDb } from './db';

type RowLinea = {
  Etiqueta: string;
  Codigo: string | number;
  Descripcion: string;
  Cantidad: number | string;
  Falta?: number | string;
};

function baseDir(): string {
  const fs = FileSystem as unknown as {
    documentDirectory?: string | null;
    cacheDirectory?: string | null;
  };
  const dir = fs.documentDirectory ?? fs.cacheDirectory;
  if (!dir) throw new Error('No hay filesystem (usa Android/iOS).');
  return dir;
}

const toInt = (v: any) => Number(String(v ?? '').replace(/\D/g, '')) || 0;

export async function importarAlbaranesDesdeListadoDB() {
  try {
    console.log('📁 STEP=picker listado_contenido.db...');
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return { ok: false as const, reason: 'canceled' as const };

    const asset = result.assets?.[0];
    const originalUri = asset?.uri;
    if (!originalUri) return { ok: false as const, reason: 'no_uri' as const };

    const sqliteDir = baseDir() + 'SQLite/';
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });

    const filename = `listado_contenido_${Date.now()}.db`;
    const destinoUri = sqliteDir + filename;

    console.log('📥 Copiando ->', destinoUri);
    await FileSystem.copyAsync({ from: originalUri, to: destinoUri });

    console.log('📂 Abriendo DB externa:', filename);
    const ext = await openDatabaseAsync(filename);

    const tables = await ext.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
    );
    const names = tables.map(t => t.name);
    console.log('📋 Tablas:', names);

    if (!names.includes('Linea')) {
      return { ok: false as const, reason: 'missing_linea' as const, tables: names };
    }

    console.log('🔍 SELECT Linea...');
    const filas = await ext.getAllAsync<RowLinea>(`
      SELECT Etiqueta, Codigo, Descripcion, Cantidad, Falta
      FROM Linea
      ORDER BY id;
    `);

    console.log('✅ Filas:', filas.length);

    await crearTablasAlbaranes(); // ✅ crea tablas locales si faltan
    const db = await getDb();

    const byEtiqueta = new Map<string, RowLinea[]>();
    for (const r of filas) {
      const et = String(r.Etiqueta ?? '').trim();
      if (!et) continue;
      if (!byEtiqueta.has(et)) byEtiqueta.set(et, []);
      byEtiqueta.get(et)!.push(r);
    }

    await db.execAsync('BEGIN');
    try {
      const upsertAlbaran = await db.prepareAsync(`
        INSERT INTO albaranes (etiqueta, created_at)
        VALUES (?, ?)
        ON CONFLICT(etiqueta) DO UPDATE SET created_at=excluded.created_at;
      `);

      const getAlbaranId = await db.prepareAsync(`
        SELECT id FROM albaranes WHERE etiqueta = ? LIMIT 1;
      `);

      const delItems = await db.prepareAsync(`
        DELETE FROM albaran_items WHERE albaran_id = ?;
      `);

      const insItem = await db.prepareAsync(`
        INSERT INTO albaran_items (
          albaran_id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
        )
        VALUES (?, ?, ?, ?, ?, 0, ?);
      `);

      let totalAlbaranes = 0;
      let totalItems = 0;

      for (const [etiqueta, rows] of byEtiqueta.entries()) {
        totalAlbaranes++;
        const now = new Date().toISOString();
        await upsertAlbaran.executeAsync([etiqueta, now]);

        const idRows = await getAlbaranId.executeAsync([etiqueta]);
        const first = (await (idRows as any).getFirstAsync()) as { id?: number } | null;
        const albaranId = first?.id ?? null;
        if (!albaranId) continue;

        await delItems.executeAsync([albaranId]);

        for (const r of rows) {
          const codigoRaw = String(r.Codigo ?? '').trim();
          const itemId = toInt(codigoRaw) || null;
          const desc = String(r.Descripcion ?? '').trim();
          const bultos = toInt(r.Cantidad);
          const falta = toInt(r.Falta);

          if (!codigoRaw || !desc || bultos <= 0) continue;

          await insItem.executeAsync([albaranId, itemId, codigoRaw, desc, bultos, falta]);
          totalItems++;
        }
      }

      await upsertAlbaran.finalizeAsync();
      await getAlbaranId.finalizeAsync();
      await delItems.finalizeAsync();
      await insItem.finalizeAsync();

      await db.execAsync('COMMIT');
      return { ok: true as const, albaranes: totalAlbaranes, items: totalItems };
    } catch (e) {
      await db.execAsync('ROLLBACK');
      throw e;
    }
  } catch (e: any) {
    console.error('❌ Error importando albaranes:', e);
    return { ok: false as const, reason: 'error' as const, error: String(e?.message ?? e) };
  }
}
