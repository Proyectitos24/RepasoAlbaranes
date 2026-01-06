import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDb } from '../database/db';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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

  const eliminarAlbaran = async (id: number) => {
    const db = await getDb();
    await db.execAsync('BEGIN');
    try {
      await db.runAsync('DELETE FROM albaran_items WHERE albaran_id = ?;', [id]);
      await db.runAsync('DELETE FROM albaranes WHERE id = ?;', [id]);
      await db.execAsync('COMMIT');
      await load();
    } catch (e) {
      await db.execAsync('ROLLBACK');
      Alert.alert('Error', 'No se pudo eliminar el albarán.');
    }
  };

  const confirmarBorrar = (id: number, etiqueta: string) => {
    Alert.alert(
      'Eliminar albarán',
      `¿Seguro que quieres eliminar el albarán ${etiqueta}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => eliminarAlbaran(id),
        },
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
              onPress={() => confirmarBorrar(item.id, item.etiqueta)}
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
