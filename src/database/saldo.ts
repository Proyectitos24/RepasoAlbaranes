// src/database/saldo.ts
import { getDb } from './db';
import { crearTablasSaldo, crearTablasAlbaranes } from './setup';

type ItemRow = {
  codigo: string;
  descripcion: string;
  bultos_esperados: number;
  bultos_revisados: number;
};

export async function finalizarAlbaran(albaranId: number) {
  const db = await getDb();

  await crearTablasAlbaranes();
  await crearTablasSaldo();

  const cab = await db.getAllAsync<{ etiqueta: string; finished_at: string | null }>(
    `SELECT etiqueta, finished_at FROM albaranes WHERE id = ? LIMIT 1;`,
    [albaranId]
  );
  const etiqueta = cab?.[0]?.etiqueta;
  const finishedAt = cab?.[0]?.finished_at ?? null;

  if (!etiqueta) throw new Error('Albarán no encontrado.');
  if (finishedAt) {
    return { ok: true as const, already: true as const, etiqueta };
  }

  const items = await db.getAllAsync<ItemRow>(
    `SELECT codigo, descripcion, bultos_esperados, bultos_revisados
     FROM albaran_items
     WHERE albaran_id = ?
     ORDER BY id ASC;`,
    [albaranId]
  );

  const now = new Date().toISOString();

  await db.execAsync('BEGIN');
  try {
    const upsertSaldo = await db.prepareAsync(`
      INSERT INTO saldo_global (codigo, descripcion, saldo, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(codigo) DO UPDATE SET
        saldo = saldo + excluded.saldo,
        descripcion = excluded.descripcion,
        updated_at = excluded.updated_at;
    `);

    const insMov = await db.prepareAsync(`
      INSERT INTO saldo_movimientos (albaran_id, etiqueta, codigo, delta, created_at)
      VALUES (?, ?, ?, ?, ?);
    `);

    let faltan = 0;
    let sobran = 0;
    let tocados = 0;

    for (const it of items) {
      const esp = Number(it.bultos_esperados ?? 0);
      const rev = Number(it.bultos_revisados ?? 0);
      const delta = rev - esp;

      if (delta === 0) continue;

      tocados++;
      if (delta < 0) faltan += Math.abs(delta);
      if (delta > 0) sobran += delta;

      await upsertSaldo.executeAsync([it.codigo, it.descripcion, delta, now]);
      await insMov.executeAsync([albaranId, etiqueta, it.codigo, delta, now]);
    }

    await upsertSaldo.finalizeAsync();
    await insMov.finalizeAsync();

    await db.runAsync(`UPDATE albaranes SET finished_at = ? WHERE id = ?;`, [now, albaranId]);

    await db.execAsync('COMMIT');

    return { ok: true as const, already: false as const, etiqueta, faltan, sobran, tocados };
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

export async function listarSaldo() {
  const db = await getDb();
  await crearTablasSaldo();

  return db.getAllAsync<{ codigo: string; descripcion: string; saldo: number; updated_at: string | null }>(
    `SELECT codigo, descripcion, saldo, updated_at
     FROM saldo_global
     WHERE saldo <> 0
     ORDER BY ABS(saldo) DESC, codigo ASC
     LIMIT 500;`
  );
}

export async function listarMovimientos(codigo: string) {
  const db = await getDb();
  await crearTablasSaldo();

  return db.getAllAsync<{ etiqueta: string | null; delta: number; created_at: string }>(
    `SELECT etiqueta, delta, created_at
     FROM saldo_movimientos
     WHERE codigo = ?
     ORDER BY id DESC
     LIMIT 300;`,
    [codigo]
  );
}

export async function borrarSaldo() {
  const db = await getDb();
  await crearTablasSaldo();

  await db.execAsync('BEGIN');
  try {
    await db.execAsync(`DELETE FROM saldo_global;`);
    await db.execAsync(`DELETE FROM saldo_movimientos;`);
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
