// src/screens/InicioScreen.tsx
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal, Alert } from 'react-native';
import { importarCatalogoDesdeArchivo, ImportProgress } from '../database/importCatalog';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type RootStackParamList = {
  Inicio: undefined;
  ListaProductos: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Inicio'>;

export default function InicioScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Preparando...');
  const [pct, setPct] = useState<number | null>(null);

  const onProgress = (p: ImportProgress) => {
    if (p.step === 'picker') {
      setLoadingText('Abriendo selector...');
      setPct(null);
    }
    if (p.step === 'mkdir') {
      setLoadingText('Preparando carpeta SQLite...');
      setPct(null);
    }
    if (p.step === 'copy') {
      setLoadingText('Copiando catalog.db...');
      setPct(null);
    }
    if (p.step === 'tables') {
      setLoadingText('Verificando tablas...');
      setPct(null);
    }
    if (p.step === 'select') {
      setLoadingText('Leyendo catálogo (SELECT)...');
      setPct(null);
    }
    if (p.step === 'insert') {
      const percent = Math.floor((p.current / p.total) * 100);
      setLoadingText(`Importando... (${p.current}/${p.total})`);
      setPct(percent);
    }
  };

  const cargarCatalogo = async () => {
    if (loading) return;

    setLoading(true);
    setLoadingText('Iniciando...');
    setPct(null);

    try {
      const res = await importarCatalogoDesdeArchivo(onProgress);
      setLoading(false);

      if (!res.ok) {
        if (res.reason === 'canceled') return;
        if (res.reason === 'missing_tables') {
          Alert.alert('Error', 'Ese archivo no tiene tablas Item/ItemEAN.');
          return;
        }
        Alert.alert('Error', 'No se pudo cargar el catálogo.');
        return;
      }

      Alert.alert('OK', `Importados: ${res.count}`, [
        { text: 'VER PRODUCTOS', onPress: () => navigation.navigate('ListaProductos') },
        { text: 'Cerrar', style: 'cancel' },
      ]);
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', 'No se pudo cargar el catálogo.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RepasoAlbaranes</Text>

      <Pressable
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={cargarCatalogo}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? 'CARGANDO...' : 'CARGAR CATALOGO (catalog.db)'}</Text>
      </Pressable>

      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.card}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>{loadingText}</Text>
            {pct !== null && <Text style={styles.loadingSub}>{pct}%</Text>}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '800', marginBottom: 18, alignSelf: 'center' },

  btn: {
    backgroundColor: '#1f6feb',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: 'white', fontWeight: '800' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  loadingSub: { fontSize: 14, opacity: 0.8 },
});
