import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { getSaldoByGrupoYCodigo, listarMovimientos } from '../database/saldo';

export default function DetalleSaldoScreen({ route }: any) {
  const { grupo, codigo, descripcion } = route.params;

  const [saldo, setSaldo] = useState<number>(0);
  const [movs, setMovs] = useState<Array<{ etiqueta: string | null; delta: number; created_at: string }>>([]);

  useEffect(() => {
    (async () => {
      const s = await getSaldoByGrupoYCodigo(grupo, codigo);
      setSaldo(s);

      const m = await listarMovimientos(grupo, codigo);
      setMovs(m);
    })();
  }, [grupo, codigo]);

  const isSobra = saldo > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{descripcion ?? 'Detalle'}</Text>
      <Text style={styles.sub}>
        Carpeta: {grupo} — Código: {codigo} — {isSobra ? `Sobra neta: +${saldo}` : `Falta neta: ${Math.abs(saldo)}`}
      </Text>

      <Text style={styles.h2}>Movimientos (por etiqueta)</Text>

      <FlatList
        data={movs}
        keyExtractor={(i, idx) => `${idx}-${i.created_at}`}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTop}>Etiqueta: {item.etiqueta ?? '-'}</Text>
            <Text style={styles.rowSub}>
              Delta: {item.delta > 0 ? `+${item.delta}` : item.delta} — {item.created_at}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Sin movimientos.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f4f4f4' },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { marginTop: 6, opacity: 0.7 },
  h2: { marginTop: 14, marginBottom: 8, fontWeight: '800' },
  row: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10 },
  rowTop: { fontWeight: '800' },
  rowSub: { marginTop: 4, opacity: 0.7 },
  empty: { textAlign: 'center', marginTop: 30, opacity: 0.6 },
});
