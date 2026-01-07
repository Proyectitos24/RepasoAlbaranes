import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDb } from '../database/db';
import { MaterialCommunityIcons } from '@expo/vector-icons';

async function ensureColumn(db: any, table: string, colName: string, colDef: string) {
  const info = (await db.getAllAsync(`PRAGMA table_info(${table});`)) as Array<{ name: string }>;
  const exists = (info ?? []).some((r) => r.name === colName);
  if (!exists) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
  }
}

export default function ListaAlbaranesScreen({ navigation }: any) {
  const [albaranes, setAlbaranes] = useState<
    Array<{ id: number; etiqueta: string; created_at: string | null; finished_at: string | null; archived_at?: string | null }>
  >([]);

  const load = useCallback(async () => {
    const db = await getDb();

    // ✅ columna para “ocultar” albaranes finalizados sin tocar saldo
    await ensureColumn(db, 'albaranes', 'archived_at', 'archived_at TEXT');

    const rows = await db.getAllAsync(
      `SELECT id, etiqueta, created_at, finished_at, archived_at
       FROM albaranes
       WHERE archived_at IS NULL
       ORDER BY id DESC;`
    );

    setAlbaranes(rows as any);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const archivarAlbaranFinalizado = async (id: number) => {
    const db = await getDb();
    const now = new Date().toISOString();

    await db.execAsync('BEGIN');
    try {
      // 1) ocultar el albarán (sale de la lista)
      await db.runAsync(`UPDATE albaranes SET archived_at = ? WHERE id = ?;`, [now, id]);

      // 2) opcional: borrar líneas para ahorrar espacio (NO afecta saldo)
      await db.runAsync(`DELETE FROM albaran_items WHERE albaran_id = ?;`, [id]);

      // ✅ NO tocar saldo_movimientos (para que faltas/sobras sigan)
      await db.execAsync('COMMIT');
      await load();
    } catch {
      await db.execAsync('ROLLBACK');
      Alert.alert('Error', 'No se pudo archivar.');
    }
  };

  const borrarAlbaranNoFinalizado = async (id: number) => {
    const db = await getDb();

    await db.execAsync('BEGIN');
    try {
      await db.runAsync(`DELETE FROM albaran_items WHERE albaran_id = ?;`, [id]);
      await db.runAsync(`DELETE FROM albaranes WHERE id = ?;`, [id]);
      await db.execAsync('COMMIT');
      await load();
    } catch {
      await db.execAsync('ROLLBACK');
      Alert.alert('Error', 'No se pudo borrar.');
    }
  };

  const onTrash = (id: number, etiqueta: string, finishedAt: string | null) => {
    if (finishedAt) {
      Alert.alert(
        'Quitar de la lista',
        `Este albarán está FINALIZADO.\n\nSi lo quitas de la lista, las faltas/sobras se mantienen (solo el encargado las borra).`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Quitar', style: 'destructive', onPress: () => archivarAlbaranFinalizado(id) },
        ]
      );
    } else {
      Alert.alert(
        'Eliminar albarán',
        `¿Seguro que quieres eliminar el albarán ${etiqueta}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => borrarAlbaranNoFinalizado(id) },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Repasar albaranes</Text>

      <FlatList
        data={albaranes}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              style={styles.info}
              onPress={() => navigation.navigate('RepasoAlbaran', { albaranId: item.id })}
            >
              <Text style={styles.label}>
                Etiqueta: <Text style={styles.value}>{item.etiqueta}</Text>
              </Text>
              <Text style={styles.date}>{item.created_at}</Text>
              {item.finished_at && (
                <Text style={styles.done}>Finalizado: {item.finished_at.split('T')[0]}</Text>
              )}
            </Pressable>

            <Pressable style={styles.trashBtn} onPress={() => onTrash(item.id, item.etiqueta, item.finished_at)}>
              <MaterialCommunityIcons name="trash-can-outline" size={26} color="#d32f2f" />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay albaranes cargados.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#eee',
  },
  info: { flex: 1 },
  label: { fontWeight: '800' },
  value: { fontWeight: '900' },
  date: { opacity: 0.6, fontSize: 13, marginTop: 2 },
  done: { fontSize: 12, color: '#2e7d32', marginTop: 4 },
  trashBtn: { padding: 6, marginLeft: 6 },
  empty: { textAlign: 'center', marginTop: 30, opacity: 0.6 },
});
