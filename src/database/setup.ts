import { getDb } from './db';

async function ensureColumn(table: string, column: string) {
  const db = await getDb();
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return cols.some(c => c.name === column);
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
    CREATE INDEX IF NOT EXISTS idx_productos_item_id ON productos(item_id);
    CREATE INDEX IF NOT EXISTS idx_productos_ean ON productos(ean);
    CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
  `);
}


export async function crearTablasAlbaranes() {
  const db = await getDb();

  await db.execAsync(`PRAGMA foreign_keys = ON;`);

  // 1) Crear tabla base si no existe
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS albaranes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etiqueta TEXT NOT NULL UNIQUE
    );
  `);

  // 2) Migración: agregar created_at si falta
  const hasCreatedAt = await ensureColumn('albaranes', 'created_at');
  if (!hasCreatedAt) {
    console.log('🛠️ Migración: añadiendo created_at a albaranes...');
    await db.execAsync(`ALTER TABLE albaranes ADD COLUMN created_at TEXT;`);
    await db.execAsync(`UPDATE albaranes SET created_at = datetime('now') WHERE created_at IS NULL;`);
  }

  // 3) Tabla items
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

  // Índices
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_albaranes_etiqueta ON albaranes(etiqueta);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_items_albaran_id ON albaran_items(albaran_id);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_items_codigo ON albaran_items(codigo);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_items_item_id ON albaran_items(item_id);`);

  console.log('✅ Tablas albaranes OK');
}
