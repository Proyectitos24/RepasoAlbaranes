import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { all } from '../database/db';

type Item = {
  id: number;
  item_id: number | null;
  codigo: string;
  descripcion: string;
  bultos_esperados: number;
  bultos_revisados: number;
};

export default function RepasoAlbaranScreen({ route }: any) {
  const { albaranId } = route.params;

  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      const rows = await all<Item>(
        `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados
         FROM albaran_items
         WHERE albaran_id = ?
         ORDER BY id ASC`,
        [albaranId]
      );
      setItems(rows);
    })();
  }, [albaranId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Repaso</Text>

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.desc}>{item.descripcion}</Text>
            <Text style={styles.meta}>
              Código: {item.codigo} | Bultos: {item.bultos_revisados}/{item.bultos_esperados}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Sin líneas para este albarán.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  row: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10 },
  desc: { fontWeight: '800' },
  meta: { opacity: 0.7, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 30, opacity: 0.6 },
});
