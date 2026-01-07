import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDb } from '../database/db';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { crearTablasSaldo } from '../database/setup';

export default function ListaAlbaranesScreen({ navigation }: any) {
  const [albaranes, setAlbaranes] = useState<
    Array<{ id: number; etiqueta: string; created_at: string | null; finished_at: string | null }>
  >([]);

  const load = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: number;
      etiqueta: string;
      created_at: string | null;
      finished_at: string | null;
    }>(`SELECT id, etiqueta, created_at, finished_at FROM albaranes ORDER BY id DESC;`);
    setAlbaranes(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const revertirSaldoSiFinalizado = async (albaranId: number) => {
    const db = await getDb();
    await crearTablasSaldo();

    // suma deltas por código (lo que ese albarán metió al saldo)
    const sums = await db.getAllAsync<{ codigo: string; sum_delta: number }>(
      `SELECT codigo, SUM(delta) as sum_delta
       FROM saldo_movimientos
       WHERE albaran_id = ?
       GROUP BY codigo;`,
      [albaranId]
    );

    if (!sums.length) return;

    const now = new Date().toISOString();

    // aplicamos la reversa: saldo += (-sum_delta)
    const upsert = await db.prepareAsync(`
      INSERT INTO saldo_global (codigo, descripcion, saldo, updated_at)
      VALUES (?, NULL, ?, ?)
      ON CONFLICT(codigo) DO UPDATE SET
        saldo = saldo_global.saldo + excluded.saldo,
        updated_at = excluded.updated_at;
    `);

    for (const r of sums) {
      const sumDelta = Number(r.sum_delta ?? 0);
      if (!r.codigo || sumDelta === 0) continue;
      await upsert.executeAsync([r.codigo, -sumDelta, now]);
    }

    await upsert.finalizeAsync();

    // borramos movimientos de ese albarán
    await db.runAsync(`DELETE FROM saldo_movimientos WHERE albaran_id = ?;`, [albaranId]);

    // limpieza: si queda saldo 0, fuera
    await db.runAsync(`DELETE FROM saldo_global WHERE saldo = 0;`);
  };

  const eliminarAlbaran = async (id: number) => {
    const db = await getDb();

    await db.execAsync('BEGIN');
    try {
      const cab = await db.getAllAsync<{ finished_at: string | null }>(
        `SELECT finished_at FROM albaranes WHERE id = ? LIMIT 1;`,
        [id]
      );
      const finishedAt = cab?.[0]?.finished_at ?? null;

      // ✅ si estaba finalizado, revertimos su impacto primero
      if (finishedAt) {
        await revertirSaldoSiFinalizado(id);
      }

      // borrar albarán
      await db.runAsync('DELETE FROM albaran_items WHERE albaran_id = ?;', [id]);
      await db.runAsync('DELETE FROM albaranes WHERE id = ?;', [id]);

      await db.execAsync('COMMIT');
      await load();
    } catch (e) {
      await db.execAsync('ROLLBACK');
      Alert.alert('Error', 'No se pudo eliminar el albarán.');
    }
  };

  const confirmarBorrar = (id: number, etiqueta: string, finishedAt: string | null) => {
    const extra = finishedAt
      ? '\n\n⚠️ Está FINALIZADO. Si lo borras, se revertirá su impacto en “Faltas y sobras”.'
      : '';

    Alert.alert(
      'Eliminar albarán',
      `¿Seguro que quieres eliminar el albarán ${etiqueta}?${extra}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => eliminarAlbaran(id) },
      ]
    );
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

            <Pressable
              style={styles.trashBtn}
              onPress={() => confirmarBorrar(item.id, item.etiqueta, item.finished_at)}
            >
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
