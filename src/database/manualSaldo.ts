import { getDb } from './db';

type ManualSaldoRow = {
  codigo: string;
  descripcion: string;
  saldo: number;
  updated_at: string;
};

type ManualResumenRow = {
  grupo: string;
  items: number;
  faltan: number;
  sobran: number;
};

type ManualMovRow = {
  etiqueta: string | null;
  delta: number;
  created_at: string;
};

export async function initManualSaldo() {
  const db = await getDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS manual_saldo_global (
      grupo TEXT NOT NULL,
      codigo TEXT NOT NULL,
      descripcion TEXT,
      saldo INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (grupo, codigo)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS manual_saldo_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grupo TEXT NOT NULL,
      etiqueta TEXT,
      codigo TEXT NOT NULL,
      delta INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_manual_mov_grupo_codigo ON manual_saldo_movimientos(grupo, codigo);`
  );
}

export async function addManualMovimiento(opts: {
  grupo: string;
  etiqueta?: string | null;
  codigo: string;
  descripcion: string;
  delta: number; // + sobra, - falta
}) {
  const db = await getDb();
  await initManualSaldo();

  const now = new Date().toISOString();

  await db.execAsync('BEGIN');
  try {
    await db.runAsync(
      `INSERT INTO manual_saldo_global (grupo, codigo, descripcion, saldo, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(grupo, codigo) DO UPDATE SET
         descripcion = excluded.descripcion,
         saldo = manual_saldo_global.saldo + excluded.saldo,
         updated_at = excluded.updated_at;`,
      [opts.grupo, opts.codigo, opts.descripcion, opts.delta, now]
    );

    await db.runAsync(
      `INSERT INTO manual_saldo_movimientos (grupo, etiqueta, codigo, delta, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      [opts.grupo, opts.etiqueta ?? null, opts.codigo, opts.delta, now]
    );

    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

export async function listarManualSaldos(grupo: string): Promise<ManualSaldoRow[]> {
  const db = await getDb();
  await initManualSaldo();

  const rows = (await db.getAllAsync(
    `SELECT codigo, descripcion, saldo, updated_at
     FROM manual_saldo_global
     WHERE grupo = ? AND saldo != 0
     ORDER BY ABS(saldo) DESC, descripcion ASC;`,
    [grupo]
  )) as any;

  return rows ?? [];
}

export async function getManualResumen(): Promise<ManualResumenRow[]> {
  const db = await getDb();
  await initManualSaldo();

  const rows = (await db.getAllAsync(
    `
    SELECT
      grupo,
      COUNT(*) as items,
      SUM(CASE WHEN saldo < 0 THEN ABS(saldo) ELSE 0 END) as faltan,
      SUM(CASE WHEN saldo > 0 THEN saldo ELSE 0 END) as sobran
    FROM manual_saldo_global
    WHERE saldo != 0
    GROUP BY grupo;
    `
  )) as any;

  return rows ?? [];
}

export async function listarManualMovimientos(grupo: string, codigo: string): Promise<ManualMovRow[]> {
  const db = await getDb();
  await initManualSaldo();

  const rows = (await db.getAllAsync(
    `SELECT etiqueta, delta, created_at
     FROM manual_saldo_movimientos
     WHERE grupo = ? AND codigo = ?
     ORDER BY created_at DESC
     LIMIT 300;`,
    [grupo, codigo]
  )) as any;

  return rows ?? [];
}

/** ✅ BORRAR SOLO UNA CARPETA (grupo) */
export async function clearManualGrupo(grupo: string) {
  const db = await getDb();
  await initManualSaldo();

  await db.execAsync('BEGIN');
  try {
    await db.runAsync(`DELETE FROM manual_saldo_movimientos WHERE grupo = ?;`, [grupo]);
    await db.runAsync(`DELETE FROM manual_saldo_global WHERE grupo = ?;`, [grupo]);
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

/** ✅ BORRAR TODO EL MANUAL (todas las carpetas) */
export async function clearManualTodo() {
  const db = await getDb();
  await initManualSaldo();

  await db.execAsync('BEGIN');
  try {
    await db.execAsync(`DELETE FROM manual_saldo_movimientos;`);
    await db.execAsync(`DELETE FROM manual_saldo_global;`);
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
