import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { clearManualGrupo, getManualResumen, listarManualSaldos } from '../database/manualSaldo';

const CARPETAS = [
  { key: 'refrigerado', label: 'Refrigerado' },
  { key: 'congelado', label: 'Congelado' },
  { key: 'seco', label: 'Seco' },
  { key: 'almacen_central', label: 'Almacén central' },
  { key: 'fruta_verdura', label: 'Fruta y verdura' },
  { key: 'pollo_carne', label: 'Pollo y carne' },
] as const;

type Resumen = { grupo: string; items: number; faltan: number; sobran: number };
type Row = { codigo: string; descripcion: string; saldo: number; updated_at: string };

export default function ManualFaltasHomeScreen({ navigation }: any) {
  const [resumen, setResumen] = useState<Resumen[]>([]);
  const [selected, setSelected] = useState<(typeof CARPETAS)[number]>(CARPETAS[0]);
  const [rows, setRows] = useState<Row[]>([]);

  const resumenMap = useMemo(() => {
    const m = new Map<string, Resumen>();
    resumen.forEach((r) => m.set(r.grupo, r));
    return m;
  }, [resumen]);

  const loadResumen = useCallback(async () => {
    const r = await getManualResumen();
    setResumen(r as any);
  }, []);

  const loadRows = useCallback(async (grupo: string) => {
    const list = await listarManualSaldos(grupo);
    setRows(list as any);
  }, []);

  const reloadAll = useCallback(async () => {
    await loadResumen();
    await loadRows(selected.key);
  }, [loadResumen, loadRows, selected.key]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  // ✅ cuando vuelves del editor, refresca
  useFocusEffect(
    useCallback(() => {
      reloadAll();
    }, [reloadAll])
  );

  const onEdit = (c: (typeof CARPETAS)[number]) => {
    navigation.navigate('ManualFaltasEditor', { grupo: c.key, grupoLabel: c.label });
  };

  const onBorrarCarpeta = () => {
    Alert.alert(
      'Borrar carpeta',
      `¿Seguro que quieres borrar TODO lo manual de "${selected.label}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearManualGrupo(selected.key);
              await reloadAll();
            } catch {
              Alert.alert('Error', 'No se pudo borrar la carpeta.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Falta y sobra manual</Text>

        <Pressable style={styles.btnDelete} onPress={onBorrarCarpeta}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#fff" />
          <Text style={styles.btnDeleteText}>Borrar carpeta</Text>
        </Pressable>
      </View>

      <View style={styles.cardsGrid}>
        {CARPETAS.map((c) => {
          const r = resumenMap.get(c.key);
          const items = r?.items ?? 0;
          const faltan = r?.faltan ?? 0;
          const sobran = r?.sobran ?? 0;
          const isSelected = selected.key === c.key;

          return (
            <Pressable
              key={c.key}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelected(c)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{c.label}</Text>

                <Pressable
                  style={styles.pencil}
                  onPress={(e: any) => {
                    e?.stopPropagation?.();
                    onEdit(c);
                  }}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color="#111" />
                </Pressable>
              </View>

              <Text style={styles.cardSub}>Ítems: {items}</Text>
              <Text style={styles.cardSub}>Faltan: {faltan} | Sobran: {sobran}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Carpeta: {selected.label}</Text>

      <FlatList
        data={rows}
        keyExtractor={(i) => i.codigo}
        renderItem={({ item }) => {
          const isSobra = item.saldo > 0;
          return (
            <Pressable style={[styles.row, isSobra ? styles.rowSobra : styles.rowFalta]} onPress={() => onEdit(selected)}>
              <Text style={styles.rowTitle}>{item.descripcion}</Text>
              <Text style={styles.rowSub}>
                Código: {item.codigo} — {isSobra ? `Sobra: +${item.saldo}` : `Falta: ${Math.abs(item.saldo)}`}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Sin faltas/sobras manuales en esta carpeta.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900' },

  btnDelete: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#c62828', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  btnDeleteText: { color: '#fff', fontWeight: '900' },

  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 2, borderColor: '#e8e8e8' },
  cardSelected: { borderColor: '#111' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '900', fontSize: 16, flex: 1, paddingRight: 8 },
  pencil: { backgroundColor: '#f1f1f1', padding: 8, borderRadius: 10 },

  cardSub: { marginTop: 6, opacity: 0.75 },

  sectionTitle: { marginTop: 16, marginBottom: 10, fontWeight: '900', fontSize: 16 },

  row: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 2 },
  rowSobra: { borderColor: '#2e7d32' },
  rowFalta: { borderColor: '#c62828' },

  rowTitle: { fontWeight: '900' },
  rowSub: { marginTop: 4, opacity: 0.7 },

  empty: { textAlign: 'center', marginTop: 24, opacity: 0.6 },
});
