// src/screens/InicioScreen.tsx
import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { setupDb } from '../database/setup';
import { importarCatalogoDesdeArchivo } from '../database/importCatalog';

export default function InicioScreen({ navigation }: any) {
  useEffect(() => {
    setupDb().catch((e) => console.log('❌ setupDb error:', e));
  }, []);

  const onImportar = async () => {
    try {
      const r = await importarCatalogoDesdeArchivo();

      if (!r.ok) {
        Alert.alert('No se pudo cargar', `Paso: ${r.step}\nDetalle: ${r.detail}`);
        return;
      }

      Alert.alert('OK', `Importados: ${r.count}`, [
        { text: 'Ver productos', onPress: () => navigation.navigate('ListaProductos') },
      ]);
    } catch (e: any) {
      console.log('❌ ERROR IMPORTAR (catch):', e);
      Alert.alert('Error real', String(e?.message ?? e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RepasoAlbaranes</Text>

      <TouchableOpacity style={styles.btn} onPress={onImportar}>
        <Text style={styles.btnText}>CARGAR CATALOGO (catalog.db)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 20 },
  btn: { backgroundColor: '#1F6FEB', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
});
