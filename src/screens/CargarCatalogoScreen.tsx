import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { importarCatalogoDesdeArchivo } from '../database/importCatalog';

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

      // Si tu función devuelve { ok: false, reason: 'canceled' }, no mostramos error.
      if (!res.ok) {
        if (res.reason === 'canceled') return;
        Alert.alert('Error', 'No se pudo cargar el catálogo.');
        return;
      }

      Alert.alert(
        'OK',
        `Importados: ${res.count}`,
        [
          { text: 'OK' },
          { text: 'Ver productos', onPress: () => navigation.navigate('ListaProductos') },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cargar catálogo</Text>

      <Pressable style={[styles.btn, loading && styles.btnDisabled]} onPress={onCargar}>
        <Text style={styles.btnText}>
          {loading ? 'Cargando...' : 'CARGAR CATALOGO (catalog.db)'}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>{status || 'Importando... (puede tardar)'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  btn: { backgroundColor: '#1f6feb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  loadingBox: { marginTop: 10, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 14, opacity: 0.8 },
});
