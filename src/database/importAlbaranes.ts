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

// ✅ parse seguro: evita "1.0" -> 10, "2,00" -> 200
const toInt = (v: any) => {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);

  const s = String(v).trim();
  if (!s) return 0;

  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  if (Number.isFinite(n)) return Math.trunc(n);

  const digits = s.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

export async function importarAlbaranesDesdeListadoDB() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true, // ✅ ahora permite seleccionar 1 o varios
    });

    if (result.canceled) return { ok: false as const, reason: 'canceled' as const };

    const assets = result.assets ?? [];
    const picked = assets.filter((a) => a?.uri);

    if (!picked.length) return { ok: false as const, reason: 'no_uri' as const };

    const sqliteDir = baseDir() + 'SQLite/';
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });

    // ✅ acumula TODO lo seleccionado en un solo Map (por etiqueta)
    const byEtiqueta = new Map<string, RowLinea[]>();

    // Importante: cerrar cada DB externa antes de seguir
    for (let i = 0; i < picked.length; i++) {
      const asset = picked[i];
      const originalUri = asset.uri;

      const filename = `listado_contenido_${Date.now()}_${i}.db`;
      const destinoUri = sqliteDir + filename;

      await FileSystem.copyAsync({ from: originalUri, to: destinoUri });

      const ext = await openDatabaseAsync(filename);
      try {
        const tables = await ext.getAllAsync<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
        );
        const names = tables.map((t) => t.name);

        if (!names.includes('Linea')) {
          return { ok: false as const, reason: 'missing_linea' as const, tables: names };
        }

        const filas = await ext.getAllAsync<RowLinea>(`
          SELECT Etiqueta, Codigo, Descripcion, Cantidad, Falta
          FROM Linea
          ORDER BY id;
        `);

        for (const r of filas) {
          const et = String(r.Etiqueta ?? '').trim();
          if (!et) continue;
          if (!byEtiqueta.has(et)) byEtiqueta.set(et, []);
          byEtiqueta.get(et)!.push(r);
        }
      } finally {
        // ✅ cierra para que luego se pueda limpiar el archivo sin problemas
        try {
          // @ts-ignore
          await ext.closeAsync?.();
        } catch {}
      }
    }

    await crearTablasAlbaranes();
    const db = await getDb();

    await db.execAsync('BEGIN');
    try {
      // existe / finalizado
      const getExist = await db.prepareAsync(`
        SELECT id, finished_at FROM albaranes WHERE etiqueta = ? LIMIT 1;
      `);

      // insertar SOLO si no existe (nunca pisamos)
      const insAlbaran = await db.prepareAsync(`
        INSERT INTO albaranes (etiqueta, created_at)
        VALUES (?, ?);
      `);

      const getAlbaranId = await db.prepareAsync(`
        SELECT id FROM albaranes WHERE etiqueta = ? LIMIT 1;
      `);

      const insItem = await db.prepareAsync(`
        INSERT INTO albaran_items (
          albaran_id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
        )
        VALUES (?, ?, ?, ?, ?, 0, ?);
      `);

      let totalAlbaranes = 0;
      let totalItems = 0;

      // sets para no repetir etiquetas en el resumen
      const yaExistenSet = new Set<string>();
      const bloqueadosFinalizadosSet = new Set<string>();

      for (const [etiqueta, rows] of byEtiqueta.entries()) {
        const now = new Date().toISOString();

        const exStmt = await getExist.executeAsync([etiqueta]);
        const exFirst = (await (exStmt as any).getFirstAsync()) as
          | { id?: number; finished_at?: string | null }
          | null;

        // ✅ si existe, NO tocar
        if (exFirst?.id) {
          if (exFirst.finished_at) bloqueadosFinalizadosSet.add(etiqueta);
          else yaExistenSet.add(etiqueta);
          continue;
        }

        await insAlbaran.executeAsync([etiqueta, now]);
        totalAlbaranes++;

        const idRows = await getAlbaranId.executeAsync([etiqueta]);
        const first = (await (idRows as any).getFirstAsync()) as { id?: number } | null;
        const albaranId = first?.id ?? null;
        if (!albaranId) continue;

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

      await getExist.finalizeAsync();
      await insAlbaran.finalizeAsync();
      await getAlbaranId.finalizeAsync();
      await insItem.finalizeAsync();

      await db.execAsync('COMMIT');
      return {
        ok: true as const,
        albaranes: totalAlbaranes,
        items: totalItems,
        yaExisten: Array.from(yaExistenSet),
        bloqueadosFinalizados: Array.from(bloqueadosFinalizadosSet),
      };
    } catch (e) {
      await db.execAsync('ROLLBACK');
      throw e;
    }
  } catch (e: any) {
    return { ok: false as const, reason: 'error' as const, error: String(e?.message ?? e) };
  } finally {
    // limpia dbs temporales antiguas (mejor esfuerzo)
    try {
      const sqliteDir = baseDir() + 'SQLite/';
      const files = await FileSystem.readDirectoryAsync(sqliteDir);
      const temps = files.filter((f) => f.startsWith('listado_contenido_') && f.endsWith('.db'));
      for (const f of temps.slice(0, Math.max(0, temps.length - 2))) {
        await FileSystem.deleteAsync(sqliteDir + f, { idempotent: true } as any);
      }
    } catch {}
  }
}
