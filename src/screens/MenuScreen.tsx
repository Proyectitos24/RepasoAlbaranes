import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

export default function MenuScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RepasoAlbaranes</Text>

      <Pressable style={styles.btn} onPress={() => navigation.navigate('CargarCatalogo')}>
        <Text style={styles.btnText}>Cargar catálogo</Text>
      </Pressable>

      <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.navigate('ListaProductos')}>
        <Text style={styles.btnText}>Consultar códigos</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  btn: { backgroundColor: '#1f6feb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnSecondary: { backgroundColor: '#2ea043' },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
