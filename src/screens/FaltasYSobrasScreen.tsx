import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  borrarSaldoGrupo,
  listarResumenPorGrupos,
  listarSaldoPorGrupo,
} from "../database/saldo";
import { getDb } from "../database/db";

const CARPETAS = [
  { key: "refrigerado", label: "Refrigerado" },
  { key: "congelado", label: "Congelado" },
  { key: "seco", label: "Seco" },
  { key: "almacen_central", label: "Almacén central" },
  { key: "fruta_verdura", label: "Fruta y verdura" },
  { key: "pollo_carne", label: "Pollo y carne" },
];

export default function FaltasYSobrasScreen({ navigation }: any) {
  const [resumen, setResumen] = useState<
    Array<{ grupo: string; items: number; faltan: number; sobran: number }>
  >([]);
  const [grupoSel, setGrupoSel] = useState<string>(CARPETAS[0].key);
  const [items, setItems] = useState<
    Array<{ codigo: string; descripcion: string | null; saldo: number }>
  >([]);

  // PIN
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);

  const labelGrupo = useMemo(
    () => CARPETAS.find((c) => c.key === grupoSel)?.label ?? grupoSel,
    [grupoSel]
  );

  const load = useCallback(async () => {
    const r = await listarResumenPorGrupos();
    setResumen(r);

    const list = await listarSaldoPorGrupo(grupoSel);
    setItems(list);
  }, [grupoSel]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const resumenMap = useMemo(() => {
    const m = new Map<
      string,
      { items: number; faltan: number; sobran: number }
    >();
    for (const r of resumen)
      m.set(r.grupo, { items: r.items, faltan: r.faltan, sobran: r.sobran });
    return m;
  }, [resumen]);

  const validarPin = async () => {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{ value: string }>(
        `SELECT value FROM app_settings WHERE key='admin_pin' LIMIT 1;`
      );
      const real = rows?.[0]?.value ?? "1234";
      return pin === real;
    } catch {
      return pin === "1234";
    }
  };

  const pedirPinYBorrarGrupo = () => {
    setPin("");
    setPinErr(null);
    setPinOpen(true);
  };

  const confirmarPin = async () => {
    const ok = await validarPin();
    if (!ok) {
      setPinErr("PIN incorrecto");
      return;
    }
    setPinOpen(false);

    Alert.alert(
      "Borrar carpeta",
      `¿Seguro que quieres borrar las incidencias de "${labelGrupo}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Borrar",
          style: "destructive",
          onPress: async () => {
            try {
              await borrarSaldoGrupo(grupoSel);
              await load();
            } catch {
              Alert.alert("Error", "No se pudo borrar.");
            }
          },
        },
      ]
    );
  };

  const Card = ({ k, label }: { k: string; label: string }) => {
    const r = resumenMap.get(k) ?? { items: 0, faltan: 0, sobran: 0 };
    const active = k === grupoSel;

    return (
      <Pressable
        style={[styles.folderCard, active && styles.folderCardActive]}
        onPress={() => setGrupoSel(k)}
      >
        <Text style={styles.folderTitle}>{label}</Text>
        <Text style={styles.folderMeta}>Ítems: {r.items}</Text>
        <Text style={styles.folderMeta}>
          Faltan: {r.faltan} | Sobran: {r.sobran}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Faltas y sobras</Text>

        <Pressable style={styles.btnDanger} onPress={pedirPinYBorrarGrupo}>
          <Text style={styles.btnText}>Borrar carpeta</Text>
        </Pressable>
      </View>

      <FlatList
        data={CARPETAS}
        keyExtractor={(i) => i.key}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => <Card k={item.key} label={item.label} />}
      />

      <View style={styles.h2Row}>
        <Text style={styles.h2}>Carpeta: {labelGrupo}</Text>

        <Pressable
          style={styles.manageBtn}
          onPress={() =>
            navigation.navigate("GestionarSaldoGrupo", {
              grupo: grupoSel,
              label: labelGrupo,
            })
          }
        >
          <Text style={styles.manageBtnText}>Gestionar</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.codigo}
        renderItem={({ item }) => {
          const isSobra = item.saldo > 0;
          return (
            <Pressable
              style={[
                styles.itemCard,
                isSobra ? styles.cardGreen : styles.cardRed,
              ]}
              onPress={() =>
                navigation.navigate("DetalleSaldo", {
                  grupo: grupoSel,
                  codigo: item.codigo,
                  descripcion: item.descripcion,
                })
              }
            >
              <Text style={styles.desc}>
                {item.descripcion ?? "(sin descripción)"}
              </Text>
              <Text style={styles.meta}>
                Código: {item.codigo} —{" "}
                {isSobra
                  ? `Sobra: +${item.saldo}`
                  : `Falta: ${Math.abs(item.saldo)}`}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No hay incidencias en esta carpeta.</Text>
        }
      />

      {/* PIN */}
      <Modal
        transparent
        visible={pinOpen}
        animationType="fade"
        onRequestClose={() => setPinOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>PIN de encargado</Text>
            <Text style={styles.modalSub}>
              Introduce el PIN para borrar esta carpeta.
            </Text>

            <TextInput
              value={pin}
              onChangeText={(t) => {
                setPinErr(null);
                setPin(t.replace(/\D/g, "").slice(0, 4));
              }}
              keyboardType="number-pad"
              placeholder="****"
              style={styles.input}
              maxLength={4}
            />

            {pinErr ? <Text style={styles.err}>{pinErr}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setPinOpen(false)}
              >
                <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={confirmarPin}
              >
                <Text style={styles.modalBtnTextPrimary}>Confirmar</Text>
              </Pressable>
            </View>

            <Text style={styles.hint}>PIN por defecto: 1234</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f4f4f4" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "800" },
  btnDanger: {
    backgroundColor: "#d32f2f",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnText: { color: "white", fontWeight: "800" },

  folderCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#eee",
  },
  folderCardActive: { borderColor: "#111" },
  folderTitle: { fontWeight: "900" },
  folderMeta: { opacity: 0.75, marginTop: 4, fontSize: 12 },

  h2: { marginTop: 14, marginBottom: 8, fontWeight: "900" },

  itemCard: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
  },
  cardGreen: { borderColor: "#2e7d32" },
  cardRed: { borderColor: "#c62828" },
  desc: { fontWeight: "800" },
  meta: { opacity: 0.7, marginTop: 4 },
  empty: { textAlign: "center", marginTop: 16, opacity: 0.6 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: "900" },
  modalSub: { marginTop: 6, opacity: 0.7 },
  input: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    fontSize: 18,
    letterSpacing: 8,
    textAlign: "center",
  },
  err: { marginTop: 8, color: "#c62828", fontWeight: "800" },

  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  modalBtnGhost: { backgroundColor: "#eee" },
  modalBtnPrimary: { backgroundColor: "#111" },
  modalBtnTextGhost: { fontWeight: "800" },
  modalBtnTextPrimary: { color: "#fff", fontWeight: "800" },
  hint: { marginTop: 10, opacity: 0.6, fontSize: 12 },

  h2Row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 8,
  },
  manageBtn: {
    backgroundColor: "#111",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  manageBtnText: { color: "white", fontWeight: "800" },
});
