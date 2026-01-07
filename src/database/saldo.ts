import { getDb } from './db';
import { crearTablasSaldo, crearTablasAlbaranes } from './setup';

const SIN_CLASIFICAR = 'sin_clasificar';

async function ensureColumn(db: any, table: string, colName: string, colDef: string) {
  const info = (await db.getAllAsync(`PRAGMA table_info(${table});`)) as Array<{ name: string }>;
  const exists = (info ?? []).some((r) => r.name === colName);
  if (!exists) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
  }
}

async function ensureSaldoSchema() {
  const db = await getDb();
  await crearTablasAlbaranes();
  await crearTablasSaldo();

  // saldo_movimientos: agregar grupo + descripcion si faltan
  try {
    await ensureColumn(db, 'saldo_movimientos', 'grupo', 'grupo TEXT');
  } catch {}
  try {
    await ensureColumn(db, 'saldo_movimientos', 'descripcion', 'descripcion TEXT');
  } catch {}

  // albaranes: guardar grupo elegido al finalizar
  try {
    await ensureColumn(db, 'albaranes', 'grupo', 'grupo TEXT');
  } catch {}

  // índices útiles (no rompen si ya existen)
  try {
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_saldo_mov_albaran_id ON saldo_movimientos(albaran_id);`);
  } catch {}
  try {
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_saldo_mov_grupo_codigo ON saldo_movimientos(grupo, codigo);`);
  } catch {}
}

type ItemRow = {
  codigo: string;
  descripcion: string;
  bultos_esperados: number;
  bultos_revisados: number;
};

export async function finalizarAlbaran(albaranId: number, grupoRaw: string) {
  const db = await getDb();
  await ensureSaldoSchema();

  const grupo = (grupoRaw ?? '').trim() || SIN_CLASIFICAR;

  const cab = await db.getAllAsync<{ etiqueta: string; finished_at: string | null }>(
    `SELECT etiqueta, finished_at FROM albaranes WHERE id = ? LIMIT 1;`,
    [albaranId]
  );

  const etiqueta = cab?.[0]?.etiqueta;
  const finishedAt = cab?.[0]?.finished_at ?? null;

  if (!etiqueta) throw new Error('Albarán no encontrado.');
  if (finishedAt) return { ok: true as const, already: true as const, etiqueta };

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
    // saldo_global = acumulado TOTAL (sin carpetas) (lo mantenemos)
    const upsertSaldo = await db.prepareAsync(`
      INSERT INTO saldo_global (codigo, descripcion, saldo, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(codigo) DO UPDATE SET
        saldo = saldo_global.saldo + excluded.saldo,
        descripcion = excluded.descripcion,
        updated_at = excluded.updated_at;
    `);

    // movimientos = con grupo (carpeta)
    const insMov = await db.prepareAsync(`
      INSERT INTO saldo_movimientos (albaran_id, etiqueta, codigo, descripcion, delta, grupo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?);
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
      await insMov.executeAsync([albaranId, etiqueta, it.codigo, it.descripcion, delta, grupo, now]);
    }

    await upsertSaldo.finalizeAsync();
    await insMov.finalizeAsync();

    // marcar finalizado + guardar carpeta
    await db.runAsync(`UPDATE albaranes SET finished_at = ?, grupo = ? WHERE id = ?;`, [now, grupo, albaranId]);

    await db.execAsync('COMMIT');
    return { ok: true as const, already: false as const, etiqueta, faltan, sobran, tocados };
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

export async function listarResumenPorGrupos() {
  const db = await getDb();
  await ensureSaldoSchema();

  // cuenta códigos con saldo != 0 dentro de cada grupo
  return db.getAllAsync<{
    grupo: string;
    items: number;
    faltan: number;
    sobran: number;
  }>(`
    SELECT
      grupo,
      COUNT(*) as items,
      SUM(CASE WHEN saldo < 0 THEN -saldo ELSE 0 END) as faltan,
      SUM(CASE WHEN saldo > 0 THEN saldo ELSE 0 END) as sobran
    FROM (
      SELECT
        COALESCE(grupo, '${SIN_CLASIFICAR}') as grupo,
        codigo,
        SUM(delta) as saldo
      FROM saldo_movimientos
      GROUP BY COALESCE(grupo, '${SIN_CLASIFICAR}'), codigo
      HAVING saldo <> 0
    ) t
    GROUP BY grupo
    ORDER BY grupo ASC;
  `);
}

export async function listarSaldoPorGrupo(grupoRaw: string) {
  const db = await getDb();
  await ensureSaldoSchema();

  const grupo = (grupoRaw ?? '').trim() || SIN_CLASIFICAR;

  return db.getAllAsync<{
    codigo: string;
    descripcion: string | null;
    saldo: number;
  }>(`
    SELECT
      codigo,
      MAX(descripcion) as descripcion,
      SUM(delta) as saldo
    FROM saldo_movimientos
    WHERE COALESCE(grupo, '${SIN_CLASIFICAR}') = ?
    GROUP BY codigo
    HAVING saldo <> 0
    ORDER BY ABS(saldo) DESC, codigo ASC;
  `, [grupo]);
}

export async function getSaldoByGrupoYCodigo(grupoRaw: string, codigo: string) {
  const db = await getDb();
  await ensureSaldoSchema();

  const grupo = (grupoRaw ?? '').trim() || SIN_CLASIFICAR;

  const rows = await db.getAllAsync<{ saldo: number }>(`
    SELECT SUM(delta) as saldo
    FROM saldo_movimientos
    WHERE COALESCE(grupo, '${SIN_CLASIFICAR}') = ?
      AND codigo = ?
    LIMIT 1;
  `, [grupo, codigo]);

  return Number(rows?.[0]?.saldo ?? 0);
}

export async function listarMovimientos(grupoRaw: string, codigo: string) {
  const db = await getDb();
  await ensureSaldoSchema();

  const grupo = (grupoRaw ?? '').trim() || SIN_CLASIFICAR;

  return db.getAllAsync<{
    etiqueta: string | null;
    delta: number;
    created_at: string;
  }>(`
    SELECT etiqueta, delta, created_at
    FROM saldo_movimientos
    WHERE COALESCE(grupo, '${SIN_CLASIFICAR}') = ?
      AND codigo = ?
    ORDER BY id DESC
    LIMIT 300;
  `, [grupo, codigo]);
}

export async function borrarSaldoGrupo(grupoRaw: string) {
  const db = await getDb();
  await ensureSaldoSchema();

  const grupo = (grupoRaw ?? '').trim() || SIN_CLASIFICAR;

  await db.execAsync('BEGIN');
  try {
    // borrar movimientos del grupo
    await db.runAsync(
      `DELETE FROM saldo_movimientos WHERE COALESCE(grupo, '${SIN_CLASIFICAR}') = ?;`,
      [grupo]
    );

    // opcional: limpiar saldo_global si queda desfasado (lo mantenemos coherente recalculando rápido)
    // Para no complicar, solo dejamos que saldo_global sea "total histórico" (si quieres, luego lo recalculamos).
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
