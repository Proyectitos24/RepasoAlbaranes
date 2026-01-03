import { exec } from './db';

export async function setupDb() {
  await exec(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      ean TEXT NOT NULL
    );
  `);

  // índices para búsquedas rápidas
  await exec(`CREATE INDEX IF NOT EXISTS idx_productos_ean ON productos(ean);`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_productos_item_id ON productos(item_id);`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);`);
}
