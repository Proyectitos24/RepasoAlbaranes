import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, TextInput, Modal } from 'react-native';
import BultosStepper from '../components/BultosStepper';
import { getDb } from '../database/db';
import { finalizarAlbaran } from '../database/saldo';

type Item = {
  id: number;
  item_id: number | null;
  codigo: string;
  descripcion: string;
  bultos_esperados: number;
  bultos_revisados: number;
};

export default function RepasoAlbaranScreen({ route, navigation }: any) {
  const { albaranId } = route.params;

  const [items, setItems] = useState<Item[]>([]);
  const [loadingFin, setLoadingFin] = useState(false);

  // buscador (también aquí cae el texto del scanner)
  const [q, setQ] = useState('');
  const qDigits = useMemo(() => q.trim().replace(/\D/g, ''), [q]);

  // lock para evitar dobles incrementos por renders/eventos
  const [scannerLocked, setScannerLocked] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const normalizarEAN13 = (raw: string) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 13) return d;
    if (d.length < 13) return d.padStart(13, '0');
    // si el scanner mete prefijos (GS1/otros), toma los últimos 13
    return d.slice(-13);
  };

  const load = async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<Item>(
      `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados
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

  const incBulto = async (it: Item, inc = 1) => {
    const db = await getDb();

    await db.runAsync(
      `UPDATE albaran_items
       SET bultos_revisados = bultos_revisados + ?
       WHERE id = ?;`,
      [inc, it.id]
    );

    setItems(prev =>
      prev.map(x =>
        x.id === it.id
          ? { ...x, bultos_revisados: Number(x.bultos_revisados ?? 0) + inc }
          : x
      )
    );
  };

  // EAN -> item_id (productos) -> item del albarán
  const resolverItemDesdeEAN = async (eanRaw: string): Promise<Item | null> => {
    const db = await getDb();
    const ean13 = normalizarEAN13(eanRaw);

    // intenta con el valor exacto y con el normalizado a 13 (por si viene 12/14 o con ceros)
    const rows = await db.getAllAsync<{ item_id: number | null }>(
      `SELECT item_id
       FROM productos
       WHERE ean = ? OR ean = ?
       LIMIT 1;`,
      [eanRaw, ean13]
    );

    const itemId = rows?.[0]?.item_id ?? null;
    if (itemId == null) {
      Alert.alert('No encontrado', `EAN ${ean13} no existe en el catálogo. Importa/actualiza el catálogo.`);
      return null;
    }

    const found = items.find(x => x.item_id === itemId || x.codigo === String(itemId));
    if (!found) {
      Alert.alert('No está en esta etiqueta', `EAN ${ean13} existe en catálogo (item_id ${itemId}), pero no está en este albarán.`);
      return null;
    }

    return found;
  };

  const handleScan = async (raw: string) => {
    if (scannerLocked) return;
    setScannerLocked(true);

    try {
      const digits = String(raw ?? '').trim().replace(/\D/g, '');
      if (!digits) return;

      // Caso típico: scanner mete EAN13 (o con prefijo -> nos quedamos con los últimos 13)
      const eanCandidate = digits.length >= 13 ? digits.slice(-13) : digits;

      // SOLO tratamos como EAN si es largo (evita confundir con código corto)
      if (eanCandidate.length >= 12) {
        const it = await resolverItemDesdeEAN(eanCandidate);
        if (!it) return;

        await incBulto(it, 1);
        setScanMsg(`+1  ${it.descripcion}`);
        setTimeout(() => setScanMsg(null), 900);

        // limpia el input para que no quede filtrando
        setQ('');
        return;
      }

      // Si alguien mete código corto manualmente y da Enter
      const found = items.find(x => x.codigo === digits || String(x.item_id ?? '') === digits);
      if (!found) {
        Alert.alert('No encontrado', `Código ${digits} no existe en esta etiqueta.`);
        return;
      }

      await incBulto(found, 1);
      setScanMsg(`+1  ${found.descripcion}`);
      setTimeout(() => setScanMsg(null), 900);
      setQ('');
    } finally {
      setScannerLocked(false);
    }
  };

  // AUTO: si el scanner físico escribe el EAN en el TextInput, suma +1
  useEffect(() => {
    if (!qDigits) return;

    // dispara solo para EAN “largo” (evita que al buscar “12345” se auto-sume)
    if (qDigits.length < 12) return;

    const t = setTimeout(() => {
      handleScan(qDigits);
    }, 80);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDigits]);

  // modal stepper
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [tempValue, setTempValue] = useState(0);

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
          placeholder="Buscar por código o descripción… (o escanea EAN)"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => handleScan(q)}
        />
      </View>

      {scanMsg ? <Text style={styles.scanMsg}>{scanMsg}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => {
          const rev = Number(item.bultos_revisados ?? 0);
          const esp = Number(item.bultos_esperados ?? 0);
          const ok = rev === esp;
          const sobra = rev > esp;
          const falta = rev < esp;

          return (
            <Pressable
              style={[styles.row, ok && styles.ok, falta && styles.warn, sobra && styles.bad]}
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

  scanMsg: { marginBottom: 8, fontWeight: '800', opacity: 0.8 },

  row: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 2, borderColor: '#eee' },
  ok: { borderColor: '#26cd2fff' },
  warn: { borderColor: '#8d8484ff' }, // falta
  bad: { borderColor: '#da3535ff' },  // sobra

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
