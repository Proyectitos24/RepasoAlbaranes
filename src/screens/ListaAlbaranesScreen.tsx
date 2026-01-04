import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { all } from '../database/db';

type Albaran = { id: number; etiqueta: string; created_at: string };

export default function ListaAlbaranesScreen({ navigation }: any) {
  const [data, setData] = useState<Albaran[]>([]);

  const load = useCallback(async () => {
    const rows = await all<Albaran>(
      `SELECT id, etiqueta, created_at FROM albaranes ORDER BY id DESC LIMIT 300`
    );
    setData(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Repasar albaranes</Text>

      <FlatList
        data={data}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('RepasoAlbaran', { albaranId: item.id })}
          >
            <Text style={styles.etq}>Etiqueta: {item.etiqueta}</Text>
            <Text style={styles.sub}>{item.created_at}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay albaranes importados.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 10 },
  etq: { fontWeight: '800' },
  sub: { opacity: 0.6, marginTop: 4, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 30, opacity: 0.6 },
});
