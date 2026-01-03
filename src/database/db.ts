import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

let dbPromise: Promise<SQLiteDatabase> | null = null;

export const getDb = () => {
  if (!dbPromise) dbPromise = openDatabaseAsync('app.db');
  return dbPromise;
};

export async function exec(sql: string) {
  const db = await getDb();
  await db.execAsync(sql);
}

export async function run(sql: string, params: any[] = []) {
  const db = await getDb();
  return db.runAsync(sql, params);
}

export async function all<T>(sql: string, params: any[] = []) {
  const db = await getDb();
  return db.getAllAsync<T>(sql, params);
}
