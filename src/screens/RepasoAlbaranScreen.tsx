import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, TextInput, Modal } from 'react-native';
import BultosStepper from '../components/BultosStepper';
import { getDb } from '../database/db';
import { finalizarAlbaran } from '../database/saldo';

const CARPETAS = [
  { key: 'refrigerado', label: 'Refrigerado' },
  { key: 'congelado', label: 'Congelado' },
  { key: 'seco', label: 'Seco' },
  { key: 'almacen_central', label: 'Almacén central' },
  { key: 'fruta_verdura', label: 'Fruta y verdura' },
  { key: 'pollo_carne', label: 'Pollo y carne' },
];

type Item = {
  id: number;
  item_id: number | null;
  codigo: string;
  descripcion: string;
  bultos_esperados: number;
  bultos_revisados: number;
  falta: number;
};

export default function RepasoAlbaranScreen({ route, navigation }: any) {
  const { albaranId } = route.params;

  const [items, setItems] = useState<Item[]>([]);
  const [loadingFin, setLoadingFin] = useState(false);

  const [etiqueta, setEtiqueta] = useState<string>('');
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const isFinalizado = !!finishedAt;

  const [q, setQ] = useState('');
  const qDigits = useMemo(() => q.trim().replace(/\D/g, ''), [q]);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [tempValue, setTempValue] = useState(0);

  // modal carpeta al finalizar
  const [carpetaOpen, setCarpetaOpen] = useState(false);

  const normalizarEAN13 = (raw: string) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 13) return d;
    if (d.length < 13) return d.padStart(13, '0');
    return d.slice(-13);
  };

  const load = async () => {
    const db = await getDb();

    const cab = await db.getAllAsync<{ etiqueta: string; finished_at: string | null }>(
      `SELECT etiqueta, finished_at FROM albaranes WHERE id = ? LIMIT 1;`,
      [albaranId]
    );
    setEtiqueta(cab?.[0]?.etiqueta ?? '');
    setFinishedAt(cab?.[0]?.finished_at ?? null);

    const rows = await db.getAllAsync<Item>(
      `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
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
    if (isFinalizado) return;
    setSelected(it);
    setTempValue(Number(it.bultos_revisados ?? 0));
    setOpen(true);
  };

  const saveStepper = async () => {
    if (!selected) return;
    if (isFinalizado) return;

    const db = await getDb();
    await db.runAsync(`UPDATE albaran_items SET bultos_revisados = ? WHERE id = ?;`, [tempValue, selected.id]);

    setItems(prev => prev.map(x => (x.id === selected.id ? { ...x, bultos_revisados: tempValue } : x)));

    setOpen(false);
    setSelected(null);
  };

  const incBulto = async (it: Item, inc = 1) => {
    const db = await getDb();

    await db.runAsync(
      `UPDATE albaran_items
       SET bultos_revisados = bultos_revisados + ?
       WHERE id = ?;`,
      [inc, it.id]
    );

    setItems(prev => {
      const found = prev.find(x => x.id === it.id);
      if (!found) return [...prev, { ...it, bultos_revisados: Number(it.bultos_revisados ?? 0) + inc }];
      return prev.map(x => (x.id === it.id ? { ...x, bultos_revisados: Number(x.bultos_revisados ?? 0) + inc } : x));
    });
  };

  const resolverItemDesdeEAN = async (eanRaw: string): Promise<Item | null> => {
    const db = await getDb();
    const ean13 = normalizarEAN13(eanRaw);

    const prod = await db.getAllAsync<{ item_id: number; nombre: string }>(
      `SELECT item_id, nombre FROM productos WHERE ean = ? OR ean = ? LIMIT 1;`,
      [eanRaw, ean13]
    );

    const itemId = prod?.[0]?.item_id ?? null;
    const nombre = (prod?.[0]?.nombre ?? '').trim();

    if (itemId == null) {
      Alert.alert('No encontrado', `EAN ${ean13} no existe en consulta códigos.`);
      return null;
    }

    const inMemory = items.find(x => x.item_id === itemId);
    if (inMemory) return inMemory;

    const existing = await db.getAllAsync<Item>(
      `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
       FROM albaran_items
       WHERE albaran_id = ? AND item_id = ?
       LIMIT 1;`,
      [albaranId, itemId]
    );

    if (existing.length > 0) {
      const row = existing[0];
      setItems(prev => (prev.some(x => x.id === row.id) ? prev : [row, ...prev]));
      return row;
    }

    // crear EXTRA
    const desc = nombre || `ITEM ${itemId}`;

    const insertRes: any = await db.runAsync(
      `INSERT INTO albaran_items (albaran_id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta)
       VALUES (?, ?, ?, ?, 0, 0, 0);`,
      [albaranId, itemId, String(itemId), desc]
    );

    const newItem: Item = {
      id: Number(insertRes?.lastInsertRowId),
      item_id: itemId,
      codigo: String(itemId),
      descripcion: desc,
      bultos_esperados: 0,
      bultos_revisados: 0,
      falta: 0,
    };

    setItems(prev => [newItem, ...prev]);
    return newItem;
  };

  const resolverItemDesdeCodigoCorto = async (raw: string): Promise<Item | null> => {
    const db = await getDb();
    const digits = String(raw ?? '').trim().replace(/\D/g, '');
    const itemId = Number(digits);
    if (!digits || !Number.isFinite(itemId) || itemId <= 0) return null;

    const inMemory = items.find(x => x.item_id === itemId || x.codigo === digits);
    if (inMemory) return inMemory;

    const prod = await db.getAllAsync<{ item_id: number; nombre: string }>(
      `SELECT item_id, nombre FROM productos WHERE item_id = ? LIMIT 1;`,
      [itemId]
    );

    const nombre = (prod?.[0]?.nombre ?? '').trim();
    if (!prod?.[0]?.item_id) {
      Alert.alert('No encontrado', `El código ${digits} no existe en consulta códigos.`);
      return null;
    }

    const existing = await db.getAllAsync<Item>(
      `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
       FROM albaran_items
       WHERE albaran_id = ? AND item_id = ?
       LIMIT 1;`,
      [albaranId, itemId]
    );

    if (existing.length > 0) {
      const row = existing[0];
      setItems(prev => (prev.some(x => x.id === row.id) ? prev : [row, ...prev]));
      return row;
    }

    const desc = nombre || `ITEM ${itemId}`;

    const insertRes: any = await db.runAsync(
      `INSERT INTO albaran_items (albaran_id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta)
       VALUES (?, ?, ?, ?, 0, 0, 0);`,
      [albaranId, itemId, String(itemId), desc]
    );

    const newItem: Item = {
      id: Number(insertRes?.lastInsertRowId),
      item_id: itemId,
      codigo: String(itemId),
      descripcion: desc,
      bultos_esperados: 0,
      bultos_revisados: 0,
      falta: 0,
    };

    setItems(prev => [newItem, ...prev]);
    return newItem;
  };

  const handleScan = async (raw: string) => {
    if (isFinalizado) {
      Alert.alert('Finalizado', 'Este albarán ya está finalizado.');
      setQ('');
      return;
    }
    if (scannerLocked) return;

    setScannerLocked(true);
    try {
      const digits = String(raw ?? '').trim().replace(/\D/g, '');
      if (!digits) return;

      const eanCandidate = digits.length >= 13 ? digits.slice(-13) : digits;

      if (eanCandidate.length >= 12) {
        const it = await resolverItemDesdeEAN(eanCandidate);
        if (!it) return;

        await incBulto(it, 1);
        setScanMsg(`+1  ${it.descripcion}${Number(it.bultos_esperados ?? 0) === 0 ? ' (EXTRA)' : ''}`);
        setTimeout(() => setScanMsg(null), 900);
        setQ('');
        return;
      }

      const it = await resolverItemDesdeCodigoCorto(digits);
      if (!it) return;

      await incBulto(it, 1);
      setScanMsg(`+1  ${it.descripcion}${Number(it.bultos_esperados ?? 0) === 0 ? ' (EXTRA)' : ''}`);
      setTimeout(() => setScanMsg(null), 900);
      setQ('');
    } finally {
      setScannerLocked(false);
    }
  };

  useEffect(() => {
    if (!qDigits) return;
    if (qDigits.length < 12) return; // auto solo EAN
    const t = setTimeout(() => handleScan(qDigits), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDigits]);

  // ✅ ahora Finalizar primero pide carpeta
  const onFinalizar = () => {
    if (isFinalizado) {
      Alert.alert('Info', 'Este albarán ya estaba finalizado.');
      return;
    }
    setCarpetaOpen(true);
  };

  const finalizarEnCarpeta = (carpetaKey: string, carpetaLabel: string) => {
    setCarpetaOpen(false);

    Alert.alert(
      'Guardar incidencias',
      `¿Guardar faltas/sobras en: ${carpetaLabel}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, finalizar',
          style: 'destructive',
          onPress: async () => {
            if (loadingFin) return;
            setLoadingFin(true);
            try {
              const res = await finalizarAlbaran(albaranId, carpetaKey);

              if (res.already) {
                Alert.alert('Info', 'Este albarán ya estaba finalizado.');
                await load();
              } else {
                await load();
                Alert.alert(
                  'Guardado',
                  `Carpeta: ${carpetaLabel}\nFaltan: ${res.faltan}\nSobran: ${res.sobran}\nLíneas con incidencia: ${res.tocados}`,
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
      {etiqueta ? <Text style={styles.subtitle}>Etiqueta: {etiqueta}</Text> : null}
      {isFinalizado ? <Text style={styles.done}>Finalizado: {finishedAt?.split('T')[0]}</Text> : null}

      <View style={styles.searchWrap}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Buscar por código o escanear EAN…"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isFinalizado}
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
          const extra = esp === 0;

          return (
            <Pressable
              style={[styles.row, ok && styles.ok, falta && styles.warn, sobra && styles.bad, extra && styles.extra]}
              onPress={() => openStepper(item)}
              disabled={isFinalizado}
            >
              <Text style={styles.desc}>{item.descripcion}</Text>
              <Text style={styles.meta}>
                Código: {item.codigo} | Bultos: {rev}/{esp}{extra ? '  (EXTRA)' : ''}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados.</Text>}
      />

      {!isFinalizado && (
        <Pressable style={[styles.btn, loadingFin && styles.btnDisabled]} disabled={loadingFin} onPress={onFinalizar}>
          <Text style={styles.btnText}>{loadingFin ? 'Guardando…' : 'Finalizar'}</Text>
        </Pressable>
      )}

      {/* Modal stepper */}
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

      {/* Modal elegir carpeta */}
      <Modal transparent visible={carpetaOpen} animationType="fade" onRequestClose={() => setCarpetaOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Dónde guardo las incidencias?</Text>
            <Text style={styles.modalSub}>Elige la carpeta/pedido:</Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {CARPETAS.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.folderBtn, loadingFin && styles.btnDisabled]}
                  disabled={loadingFin}
                  onPress={() => finalizarEnCarpeta(c.key, c.label)}
                >
                  <Text style={styles.folderBtnText}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 12 }]} onPress={() => setCarpetaOpen(false)}>
              <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle: { opacity: 0.7, marginBottom: 2 },
  done: { color: '#2e7d32', fontWeight: '800', marginBottom: 10 },

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
  ok: { borderColor: '#2e7d32' },
  warn: { borderColor: '#f57c00' },
  bad: { borderColor: '#c62828' },
  extra: { borderStyle: 'dashed' },

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

  folderBtn: { backgroundColor: '#111', padding: 12, borderRadius: 12, alignItems: 'center' },
  folderBtnText: { color: '#fff', fontWeight: '900' },
});
