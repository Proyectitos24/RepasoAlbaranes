import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { all } from '../database/db';

type Producto = {
  id: number;
  item_id: number;
  nombre: string;
  ean: string;
};

export default function ListaProductosScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(false);

  const q = useMemo(() => busqueda.trim(), [busqueda]);
  const qDigits = useMemo(() => q.replace(/\D/g, ''), [q]);

  useEffect(() => {
    let alive = true;

    const t = setTimeout(async () => {
      setLoading(true);

      try {
        // 0) Sin búsqueda -> últimos 200
        if (q.length === 0) {
          const rows = await all<Producto>(
            `SELECT id, item_id, nombre, ean FROM productos ORDER BY id DESC LIMIT 200`
          );
          if (alive) setData(rows);
          return;
        }

        // 1) Si escribió números (ej. "192"), priorizamos item_id exacto
        // Ajusta el <= 6 si tu ItemID puede ser más largo
        const esPosibleItemId = qDigits.length > 0 && qDigits.length <= 6;

        if (esPosibleItemId) {
          const itemId = Number(qDigits);

          const exact = await all<Producto>(
            `SELECT id, item_id, nombre, ean
             FROM productos
             WHERE item_id = ?
             ORDER BY id DESC
             LIMIT 200`,
            [itemId]
          );

          // Si existe match exacto, lo devolvemos y no buscamos por EAN/nombre
          if (exact.length > 0) {
            if (alive) setData(exact);
            return;
          }
        }

        // 2) Si no hay match exacto, hacemos búsqueda general
        const likeText = `%${q}%`;
        const likeDigits = qDigits ? `%${qDigits}%` : likeText;

        const rows = await all<Producto>(
          `SELECT id, item_id, nombre, ean
           FROM productos
           WHERE nombre LIKE ?
              OR ean LIKE ?
              OR CAST(item_id AS TEXT) LIKE ?
           ORDER BY id DESC
           LIMIT 200`,
          [likeText, likeDigits, likeDigits]
        );

        if (alive) setData(rows);
      } finally {
        if (alive) setLoading(false);
      }
    }, 150);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, qDigits]);

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Productos guardados</Text>

      <TextInput
        placeholder="Buscar por nombre, código o EAN"
        style={styles.input}
        value={busqueda}
        onChangeText={setBusqueda}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.nombre}>{item.nombre}</Text>
            <Text>ID: {item.item_id}</Text>
            <Text>EAN: {item.ean}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.vacio}>
            {loading ? 'Cargando...' : 'No se encontraron productos.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  titulo: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  input: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  item: {
    backgroundColor: 'white',
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
  },
  nombre: { fontWeight: 'bold', marginBottom: 4 },
  vacio: { textAlign: 'center', color: 'gray', marginTop: 20 },
});
