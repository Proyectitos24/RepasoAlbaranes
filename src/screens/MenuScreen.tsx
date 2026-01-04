import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDb } from '../database/db';

export default function MenuScreen({ navigation }: any) {
  const [count, setCount] = useState(0);

  const cargarEstado = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{ c: number }>('SELECT COUNT(*) as c FROM productos;');
      setCount(rows?.[0]?.c ?? 0);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  useFocusEffect(
    useCallback(() => {
      cargarEstado();
    }, [cargarEstado])
  );

  const hayCatalogo = count > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RepasoAlbaranes</Text>
      <Text style={styles.sub}>
        Catálogo: {hayCatalogo ? `CARGADO (${count.toLocaleString()})` : 'NO CARGADO'}
      </Text>

      <Pressable style={styles.btn} onPress={() => navigation.navigate('CargarCatalogo')}>
        <Text style={styles.btnText}>Cargar / Actualizar catálogo</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, !hayCatalogo && styles.btnDisabled]}
        disabled={!hayCatalogo}
        onPress={() => navigation.navigate('ListaProductos')}
      >
        <Text style={styles.btnText}>Consultar códigos</Text>
      </Pressable>

      {!hayCatalogo && (
        <Text style={styles.hint}>Primero carga el catálogo para poder consultar.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 34, fontWeight: '800', textAlign: 'center' },
  sub: { textAlign: 'center', opacity: 0.7, marginBottom: 12 },

  btn: { backgroundColor: '#1f6feb', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: 'white', fontWeight: '800' },

  hint: { marginTop: 6, textAlign: 'center', opacity: 0.6 },
});
