import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
};

export default function BultosStepper({ value, onMinus, onPlus }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.btn} onPress={onMinus}>
        <Text style={styles.btnText}>−</Text>
      </Pressable>

      <Text style={styles.value}>{value}</Text>

      <Pressable style={styles.btn} onPress={onPlus}>
        <Text style={styles.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  value: { minWidth: 30, textAlign: 'center', fontSize: 18, fontWeight: '800' },
});
