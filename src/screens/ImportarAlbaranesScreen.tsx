import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { importarAlbaranesDesdeListadoDB } from '../database/importAlbaranes';

export default function ImportarAlbaranesScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);

  const onImport = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const res = await importarAlbaranesDesdeListadoDB();

      if (!res.ok) {
        if (res.reason === 'canceled') return;
        Alert.alert('Error', `No se pudo importar: ${res.reason}`);
        return;
      }

      const yaExisten = (res as any).yaExisten as string[] | undefined;
      const bloqueadosFinalizados = (res as any).bloqueadosFinalizados as string[] | undefined;

      const nExist = yaExisten?.length ?? 0;
      const nFin = bloqueadosFinalizados?.length ?? 0;

      // ✅ Caso típico: re-subes 1 etiqueta FINALIZADA
      if (res.albaranes === 0 && nFin === 1 && nExist === 0) {
        const et = (bloqueadosFinalizados?.[0] ?? '').trim();
        Alert.alert(
          'Albarán ya repasado',
          `La etiqueta ${et || '(sin etiqueta)'} ya está FINALIZADA. No se volvió a importar.`,
          [
            { text: 'Ver faltas y sobras', onPress: () => navigation.navigate('FaltasYSobras') },
            { text: 'OK' },
          ]
        );
        return;
      }

      // ✅ Caso típico: re-subes 1 etiqueta existente (NO finalizada)
      if (res.albaranes === 0 && nExist === 1 && nFin === 0) {
        Alert.alert('Aviso', 'Este albarán ya existe.', [
          { text: 'OK' },
          { text: 'Ir a repasar', onPress: () => navigation.navigate('ListaAlbaranes') },
        ]);
        return;
      }

      const ejemplos = (arr?: string[]) => {
        if (!arr?.length) return '';
        const show = arr.slice(0, 4).join(', ');
        return arr.length > 4 ? `${show}…` : show;
      };

      const title = nExist || nFin ? 'Importación OK (con avisos)' : 'Importación OK';
      let msg = `Nuevos albaranes: ${res.albaranes}\nNuevas líneas: ${res.items}`;

      if (nExist) msg += `\n\nYa existen: ${nExist}${ejemplos(yaExisten) ? ` (${ejemplos(yaExisten)})` : ''}`;
      if (nFin) msg += `\nFinalizados (no se tocaron): ${nFin}${ejemplos(bloqueadosFinalizados) ? ` (${ejemplos(bloqueadosFinalizados)})` : ''}`;

      Alert.alert(title, msg, [
        { text: 'Ver faltas y sobras', onPress: () => navigation.navigate('FaltasYSobras') },
        { text: 'Ir a repasar', onPress: () => navigation.navigate('ListaAlbaranes') },
        { text: 'OK' },
      ]);
    } catch (e: any) {
      Alert.alert('Error', String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Añadir albaranes</Text>

      <Pressable style={[styles.btn, loading && styles.disabled]} disabled={loading} onPress={onImport}>
        <Text style={styles.btnText}>{loading ? 'Importando…' : 'Seleccionar listado_contenido.db'}</Text>
      </Pressable>

      {loading && (
        <View style={styles.box}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>Importando…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800' },
  btn: { backgroundColor: '#1f6feb', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  box: { alignItems: 'center', gap: 10, marginTop: 8 },
  hint: { opacity: 0.7 },
});
