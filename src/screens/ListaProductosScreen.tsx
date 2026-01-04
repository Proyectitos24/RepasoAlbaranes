import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { all } from '../database/db';

type Producto = {
  id: number;
  item_id: number;
  nombre: string;
  ean: string;
};

export default function ListaProductosScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(false);

  // Cámara
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const q = useMemo(() => busqueda.trim(), [busqueda]);
  const qDigits = useMemo(() => q.replace(/\D/g, ''), [q]);

  // --- SQL SEARCH (no carga 52k en memoria) ---
  useEffect(() => {
    let alive = true;

    const t = setTimeout(async () => {
      setLoading(true);

      try {
        // 0) Sin búsqueda -> últimos 200
        if (q.length === 0) {
          const rows = await all<Producto>(
            `SELECT id, item_id, nombre, ean FROM productos ORDER BY id DESC LIMIT 200`
          );
          if (alive) setData(rows);
          return;
        }

        // 1) Prioridad: item_id exacto si parece código corto
        const esPosibleItemId = qDigits.length > 0 && qDigits.length <= 6; // ajusta si tu ItemID es más largo

        if (esPosibleItemId) {
          const itemId = Number(qDigits);
          const exact = await all<Producto>(
            `SELECT id, item_id, nombre, ean
             FROM productos
             WHERE item_id = ?
             ORDER BY id DESC
             LIMIT 200`,
            [itemId]
          );

          if (exact.length > 0) {
            if (alive) setData(exact);
            return;
          }
        }

        // 2) Búsqueda general
        const likeText = `%${q}%`;
        const likeDigits = qDigits ? `%${qDigits}%` : likeText;

        const rows = await all<Producto>(
          `SELECT id, item_id, nombre, ean
           FROM productos
           WHERE nombre LIKE ?
              OR ean LIKE ?
              OR CAST(item_id AS TEXT) LIKE ?
           ORDER BY id DESC
           LIMIT 200`,
          [likeText, likeDigits, likeDigits]
        );

        if (alive) setData(rows);
      } finally {
        if (alive) setLoading(false);
      }
    }, 200); // debounce 150-300ms

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, qDigits]);

  // --- Abrir cámara ---
  const abrirScanner = async () => {
    setScannerLocked(false);

    if (!permission) {
      // permisos aún cargando
      return;
    }

    if (!permission.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }

    setScannerOpen(true);
  };

  const cerrarScanner = () => {
    setScannerOpen(false);
    setScannerLocked(false);
  };

  const onBarcode = ({ data }: { data: string }) => {
    if (scannerLocked) return;
    setScannerLocked(true);

    // Normaliza (solo dígitos) por si el scanner mete espacios
    const limpio = String(data ?? '').trim();
    setBusqueda(limpio);
    cerrarScanner();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Consultar códigos</Text>

      <View style={styles.searchRow}>
        <TextInput
          placeholder="Buscar por nombre, código o EAN"
          style={styles.input}
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable style={styles.cameraBtn} onPress={abrirScanner}>
          <Text style={styles.cameraIcon}>📷</Text>
        </Pressable>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.nombre}>{item.nombre}</Text>
            <Text>ID: {item.item_id}</Text>
            <Text>EAN: {item.ean}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.vacio}>
            {loading ? 'Buscando...' : 'No se encontraron productos.'}
          </Text>
        }
      />

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={cerrarScanner}>
        <View style={styles.modalContainer}>
          <View style={styles.modalTop}>
            <Text style={styles.modalTitle}>Escanear código</Text>
            <Pressable onPress={cerrarScanner} style={styles.closeBtn}>
              <Text style={styles.closeText}>Cerrar</Text>
            </Pressable>
          </View>

          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={onBarcode}
          />

          <Text style={styles.modalHint}>
            Apunta al código de barras. Se rellenará el buscador automáticamente.
          </Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  titulo: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },

  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 },
  input: {
    flex: 1,
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cameraBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#9eb7deff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: { color: 'white', fontSize: 20 },

  item: { backgroundColor: 'white', padding: 12, marginBottom: 12, borderRadius: 12 },
  nombre: { fontWeight: 'bold', marginBottom: 4 },
  vacio: { textAlign: 'center', color: 'gray', marginTop: 20 },

  modalContainer: { flex: 1, backgroundColor: '#000' },
  modalTop: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#222', borderRadius: 8 },
  closeText: { color: 'white', fontWeight: '700' },
  camera: { flex: 1 },
  modalHint: { color: 'white', padding: 16, opacity: 0.85 },
});
