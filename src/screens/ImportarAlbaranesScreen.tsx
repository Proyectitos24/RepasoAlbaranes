import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { importarAlbaranesDesdeListadoDB } from '../database/importAlbaranes';

export default function ImportarAlbaranesScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);

  const onImport = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const res = await importarAlbaranesDesdeListadoDB();

      if (!res.ok) {
        if (res.reason === 'canceled') return;
        Alert.alert('Error', `No se pudo importar: ${res.reason}`);
        return;
      }

      Alert.alert(
        'Importación OK',
        `Albaranes: ${res.albaranes}\nLíneas: ${res.items}`,
        [{ text: 'Ir a repasar', onPress: () => navigation.navigate('ListaAlbaranes') }]
      );
    } catch (e: any) {
      Alert.alert('Error', String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Añadir albaranes</Text>

      <Pressable style={[styles.btn, loading && styles.disabled]} disabled={loading} onPress={onImport}>
        <Text style={styles.btnText}>{loading ? 'Importando…' : 'Seleccionar listado_contenido.db'}</Text>
      </Pressable>

      {loading && (
        <View style={styles.box}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>Convirtiendo a tabla…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800' },
  btn: { backgroundColor: '#1f6feb', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  box: { alignItems: 'center', gap: 10, marginTop: 8 },
  hint: { opacity: 0.7 },
});
