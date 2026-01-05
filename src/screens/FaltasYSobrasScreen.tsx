import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { borrarSaldo, listarSaldo } from '../database/saldo';

export default function FaltasYSobrasScreen({ navigation }: any) {
  const [data, setData] = useState<Array<{ codigo: string; descripcion: string; saldo: number }>>([]);

  const load = useCallback(async () => {
    const rows = await listarSaldo();
    setData(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onBorrar = () => {
    Alert.alert(
      'Borrar faltas y sobras',
      '¿Seguro? Esto reinicia el saldo acumulado (solo encargado).',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await borrarSaldo();
              await load();
              Alert.alert('Listo', 'Saldo reiniciado.');
            } catch {
              Alert.alert('Error', 'No se pudo borrar.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Faltas y sobras</Text>

        <Pressable style={styles.btnDanger} onPress={onBorrar}>
          <Text style={styles.btnText}>Borrar</Text>
        </Pressable>
      </View>

      <FlatList
        data={data}
        keyExtractor={(i) => i.codigo}
        renderItem={({ item }) => {
          const isSobra = item.saldo > 0;
          return (
            <Pressable
              style={[styles.card, isSobra ? styles.cardGreen : styles.cardRed]}
              onPress={() => navigation.navigate('DetalleSaldo', { codigo: item.codigo, descripcion: item.descripcion })}
            >
              <Text style={styles.desc}>{item.descripcion}</Text>
              <Text style={styles.meta}>
                Código: {item.codigo} — {isSobra ? `Sobra: +${item.saldo}` : `Falta: ${Math.abs(item.saldo)}`}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No hay faltas/sobras acumuladas.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  btnDanger: { backgroundColor: '#d32f2f', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { color: 'white', fontWeight: '800' },

  card: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 2 },
  cardGreen: { borderColor: '#2e7d32' },
  cardRed: { borderColor: '#c62828' },
  desc: { fontWeight: '800' },
  meta: { opacity: 0.7, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 30, opacity: 0.6 },
});
