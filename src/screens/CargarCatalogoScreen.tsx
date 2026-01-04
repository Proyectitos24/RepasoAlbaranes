import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { importarCatalogoDesdeArchivo } from '../database/importCatalog';
import { getDb } from '../database/db';

type Props = NativeStackScreenProps<RootStackParamList, 'CargarCatalogo'>;

export default function CargarCatalogoScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  const onCargar = async () => {
    if (loading) return;
    setLoading(true);
    setStatus('Abriendo selector...');

    try {
      const res = await importarCatalogoDesdeArchivo();

      if (!res.ok) {
        if (res.reason === 'canceled') return;
        Alert.alert('Error', 'No se pudo cargar el catálogo.');
        return;
      }

      Alert.alert('OK', `Importados: ${res.count}`, [
        { text: 'OK' },
        { text: 'Ver productos', onPress: () => navigation.navigate('ListaProductos') },
      ]);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const borrarCatalogo = async () => {
    const db = await getDb();
    await db.execAsync('BEGIN');
    try {
      await db.execAsync('DELETE FROM productos;');
      // opcional: reinicia autoincrement
      await db.execAsync(`DELETE FROM sqlite_sequence WHERE name='productos';`);
      await db.execAsync('COMMIT');
    } catch (e) {
      await db.execAsync('ROLLBACK');
      throw e;
    }
  };

  const onBorrar = () => {
    if (loading) return;

    Alert.alert(
      'Borrar catálogo',
      '¿Seguro que quieres borrar el catálogo? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              setStatus('Borrando catálogo...');
              await borrarCatalogo();
              Alert.alert('Listo', 'Catálogo borrado.');
            } catch {
              Alert.alert('Error', 'No se pudo borrar el catálogo.');
            } finally {
              setLoading(false);
              setStatus('');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Catálogo</Text>

      <Pressable
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={onCargar}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? 'Cargando...' : 'CARGAR CATALOGO (catalog.db)'}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.btnDanger, loading && styles.btnDisabled]}
        onPress={onBorrar}
        disabled={loading}
      >
        <Text style={styles.btnText}>Borrar catálogo</Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>{status || 'Procesando... (puede tardar)'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  btn: {
    backgroundColor: '#1f6feb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDanger: { backgroundColor: '#d32f2f' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  loadingBox: { marginTop: 10, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 14, opacity: 0.8 },
});
