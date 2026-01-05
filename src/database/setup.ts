// src/database/setup.ts
import { getDb } from './db';

async function getColumns(table: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return rows.map(r => r.name);
}

async function tableExists(table: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`,
    [table]
  );
  return rows.length > 0;
}

async function ensureColumn(table: string, col: string, typeSql: string) {
  const cols = await getColumns(table);
  if (!cols.includes(col)) {
    const db = await getDb();
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeSql};`);
  }
}

export async function crearTablaProductos() {
  const db = await getDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      nombre TEXT,
      ean TEXT
    );
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_productos_ean ON productos(ean);
    CREATE INDEX IF NOT EXISTS idx_productos_item_id ON productos(item_id);
    CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
  `);
}

export async function crearTablasAlbaranes() {
  const db = await getDb();

  const existsAlbaranes = await tableExists('albaranes');
  if (!existsAlbaranes) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS albaranes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        etiqueta TEXT NOT NULL UNIQUE,
        created_at TEXT,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_albaranes_etiqueta ON albaranes(etiqueta);
    `);
  } else {
    // migración suave
    await ensureColumn('albaranes', 'created_at', 'TEXT');
    await ensureColumn('albaranes', 'finished_at', 'TEXT');

    // rellena created_at si estaba null
    const now = new Date().toISOString();
    await db.execAsync(`UPDATE albaranes SET created_at = COALESCE(created_at, '${now}');`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_albaranes_etiqueta ON albaranes(etiqueta);`);
  }

  const existsItems = await tableExists('albaran_items');
  if (!existsItems) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS albaran_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        albaran_id INTEGER NOT NULL,
        item_id INTEGER,
        codigo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        bultos_esperados INTEGER NOT NULL,
        bultos_revisados INTEGER NOT NULL DEFAULT 0,
        falta INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (albaran_id) REFERENCES albaranes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_items_albaran_id ON albaran_items(albaran_id);
      CREATE INDEX IF NOT EXISTS idx_items_codigo ON albaran_items(codigo);
    `);
  } else {
    // si no tiene columnas esperadas, migramos a una tabla nueva (sin perder lo que se pueda)
    const cols = await getColumns('albaran_items');
    const needs =
      !cols.includes('bultos_esperados') ||
      !cols.includes('bultos_revisados') ||
      !cols.includes('item_id');

    if (needs) {
      await db.execAsync('BEGIN');
      try {
        await db.execAsync(`ALTER TABLE albaran_items RENAME TO albaran_items_old;`);

        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS albaran_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            albaran_id INTEGER NOT NULL,
            item_id INTEGER,
            codigo TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            bultos_esperados INTEGER NOT NULL,
            bultos_revisados INTEGER NOT NULL DEFAULT 0,
            falta INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (albaran_id) REFERENCES albaranes(id) ON DELETE CASCADE
          );
        `);

        const oldCols = await getColumns('albaran_items_old');

        const itemIdExpr = oldCols.includes('item_id') ? 'item_id' : 'NULL';
        const codigoExpr = oldCols.includes('codigo') ? 'codigo' : `''`;
        const descExpr = oldCols.includes('descripcion') ? 'descripcion' : `''`;

        const esperadosExpr =
          oldCols.includes('bultos_esperados') ? 'bultos_esperados'
          : oldCols.includes('cantidad') ? 'cantidad'
          : '0';

        const revisadosExpr =
          oldCols.includes('bultos_revisados') ? 'bultos_revisados'
          : oldCols.includes('revisados') ? 'revisados'
          : '0';

        const faltaExpr = oldCols.includes('falta') ? 'falta' : '0';

        await db.execAsync(`
          INSERT INTO albaran_items (albaran_id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta)
          SELECT
            albaran_id,
            ${itemIdExpr},
            ${codigoExpr},
            ${descExpr},
            ${esperadosExpr},
            ${revisadosExpr},
            ${faltaExpr}
          FROM albaran_items_old;
        `);

        await db.execAsync(`DROP TABLE albaran_items_old;`);

        await db.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_items_albaran_id ON albaran_items(albaran_id);
          CREATE INDEX IF NOT EXISTS idx_items_codigo ON albaran_items(codigo);
        `);

        await db.execAsync('COMMIT');
      } catch (e) {
        await db.execAsync('ROLLBACK');
        throw e;
      }
    } else {
      // solo asegurar índices
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_items_albaran_id ON albaran_items(albaran_id);
        CREATE INDEX IF NOT EXISTS idx_items_codigo ON albaran_items(codigo);
      `);
    }
  }

  // foreign keys
  await db.execAsync(`PRAGMA foreign_keys = ON;`);
}

export async function crearTablasSaldo() {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saldo_global (
      codigo TEXT PRIMARY KEY,
      descripcion TEXT,
      saldo INTEGER NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS saldo_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      albaran_id INTEGER,
      etiqueta TEXT,
      codigo TEXT NOT NULL,
      delta INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_saldo_codigo ON saldo_global(codigo);
    CREATE INDEX IF NOT EXISTS idx_mov_codigo ON saldo_movimientos(codigo);
  `);
}

export async function initDb() {
  await crearTablaProductos();
  await crearTablasAlbaranes();
  await crearTablasSaldo();
}
