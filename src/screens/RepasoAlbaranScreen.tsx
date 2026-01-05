import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, TextInput, Modal } from 'react-native';
import BultosStepper from '../components/BultosStepper';
import { getDb } from '../database/db';
import { finalizarAlbaran } from '../database/saldo';

type Item = {
  id: number;
  codigo: string;
  descripcion: string;
  bultos_esperados: number;
  bultos_revisados: number;
};

export default function RepasoAlbaranScreen({ route, navigation }: any) {
  const { albaranId } = route.params;

  const [items, setItems] = useState<Item[]>([]);
  const [loadingFin, setLoadingFin] = useState(false);

  // buscador
  const [q, setQ] = useState('');

  // modal stepper
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [tempValue, setTempValue] = useState(0);

  const load = async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<Item>(
      `SELECT id, codigo, descripcion, bultos_esperados, bultos_revisados
       FROM albaran_items
       WHERE albaran_id = ?
       ORDER BY id ASC;`,
      [albaranId]
    );
    setItems(rows);
  };

  useEffect(() => {
    load();
  }, [albaranId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;

    return items.filter(it =>
      it.codigo.toLowerCase().includes(s) || it.descripcion.toLowerCase().includes(s)
    );
  }, [q, items]);

  const openStepper = (it: Item) => {
    setSelected(it);
    setTempValue(Number(it.bultos_revisados ?? 0));
    setOpen(true);
  };

  const saveStepper = async () => {
    if (!selected) return;
    const db = await getDb();

    await db.runAsync(
      `UPDATE albaran_items SET bultos_revisados = ? WHERE id = ?;`,
      [tempValue, selected.id]
    );

    // refresca en memoria sin recargar todo
    setItems(prev =>
      prev.map(x => (x.id === selected.id ? { ...x, bultos_revisados: tempValue } : x))
    );

    setOpen(false);
    setSelected(null);
  };

  const onFinalizar = () => {
    Alert.alert(
      'Finalizar repaso',
      '¿Seguro que terminaste esta etiqueta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, finalizar',
          style: 'destructive',
          onPress: async () => {
            if (loadingFin) return;
            setLoadingFin(true);
            try {
              const res = await finalizarAlbaran(albaranId);

              if (res.already) {
                Alert.alert('Info', 'Este albarán ya estaba finalizado.');
              } else {
                Alert.alert(
                  'Guardado',
                  `Faltan: ${res.faltan}\nSobran: ${res.sobran}\nLíneas con incidencia: ${res.tocados}`,
                  [
                    { text: 'Ver faltas y sobras', onPress: () => navigation.navigate('FaltasYSobras') },
                    { text: 'OK' },
                  ]
                );
              }
            } catch {
              Alert.alert('Error', 'No se pudo finalizar.');
            } finally {
              setLoadingFin(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Repaso</Text>

      <View style={styles.searchWrap}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Buscar por código o descripción…"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {/* más adelante aquí ponemos el icono cámara */}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => {
          const rev = Number(item.bultos_revisados ?? 0);
          const esp = Number(item.bultos_esperados ?? 0);
          const ok = rev === esp;
          const sobra = rev > esp;

          return (
            <Pressable
              style={[styles.row, ok && styles.ok, sobra && styles.bad]}
              onPress={() => openStepper(item)}
            >
              <Text style={styles.desc}>{item.descripcion}</Text>
              <Text style={styles.meta}>
                Código: {item.codigo} | Bultos: {rev}/{esp}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados.</Text>}
      />

      <Pressable style={[styles.btn, loadingFin && styles.btnDisabled]} disabled={loadingFin} onPress={onFinalizar}>
        <Text style={styles.btnText}>{loadingFin ? 'Guardando…' : 'Finalizar'}</Text>
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selected?.descripcion}</Text>
            <Text style={styles.modalSub}>
              Código: {selected?.codigo} — Esperado: {selected?.bultos_esperados}
            </Text>

            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <BultosStepper
                value={tempValue}
                onMinus={() => setTempValue(v => Math.max(0, v - 1))}
                onPlus={() => setTempValue(v => v + 1)}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setOpen(false)}>
                <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
              </Pressable>

              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveStepper}>
                <Text style={styles.modalBtnTextPrimary}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 12 },

  searchWrap: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  search: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },

  row: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 2, borderColor: '#eee' },
  ok: { borderColor: '#2e7d32' },
  bad: { borderColor: '#c62828' },

  desc: { fontWeight: '800' },
  meta: { opacity: 0.7, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 30, opacity: 0.6 },

  btn: { backgroundColor: '#111', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalSub: { marginTop: 6, opacity: 0.7 },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: '#eee' },
  modalBtnPrimary: { backgroundColor: '#111' },
  modalBtnTextGhost: { fontWeight: '800' },
  modalBtnTextPrimary: { color: '#fff', fontWeight: '800' },
});
