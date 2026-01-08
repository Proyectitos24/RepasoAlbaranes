import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

import BultosStepper from "../components/BultosStepper";
import { getDb } from "../database/db";
import {
  addManualMovimiento,
  listarManualSaldos,
} from "../database/manualSaldo";

type Row = {
  codigo: string;
  descripcion: string;
  saldo: number;
  updated_at: string;
};
type Pick = { codigo: string; descripcion: string };

export default function ManualFaltasEditorScreen({ route, navigation }: any) {
  const grupo = route?.params?.grupo as string | undefined;
  const grupoLabel = route?.params?.grupoLabel as string | undefined;

  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const qLower = useMemo(() => q.trim().toLowerCase(), [q]);
  const qDigits = useMemo(() => q.trim().replace(/\D/g, ""), [q]);

  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [qty, setQty] = useState(1);

  const [perm, requestPerm] = useCameraPermissions();
  const [camOpen, setCamOpen] = useState(false);
  const [camBusy, setCamBusy] = useState(false);

  const load = async () => {
    if (!grupo) return;
    const list = await listarManualSaldos(grupo);
    setRows(list as any);
  };

  useEffect(() => {
    load();
  }, [grupo]);

  const filtered = useMemo(() => {
    if (!qLower) return rows;
    return rows.filter(
      (r) =>
        (r.codigo ?? "").toLowerCase().includes(qLower) ||
        (r.descripcion ?? "").toLowerCase().includes(qLower)
    );
  }, [rows, qLower]);

  const normalizarEAN = (raw: string) => {
    const d = String(raw ?? "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length === 13) return d;
    if (d.length < 13) return d.padStart(13, "0");
    return d.slice(-13);
  };

  const buscarProductoEnConsulta = async (
    digits: string
  ): Promise<Pick | null> => {
    const db = await getDb();

    if (digits.length >= 8) {
      const ean13 = normalizarEAN(digits);
      const prod = (await db.getAllAsync(
        `SELECT item_id, nombre FROM productos WHERE ean = ? OR ean = ? LIMIT 1;`,
        [digits, ean13]
      )) as any[];

      if (prod?.[0]?.item_id) {
        return {
          codigo: String(prod[0].item_id),
          descripcion:
            String(prod[0].nombre ?? "").trim() || `ITEM ${prod[0].item_id}`,
        };
      }
    }

    const id = Number(digits);
    if (!Number.isFinite(id) || id <= 0) return null;

    const prod2 = (await db.getAllAsync(
      `SELECT item_id, nombre FROM productos WHERE item_id = ? LIMIT 1;`,
      [id]
    )) as any[];

    if (prod2?.[0]?.item_id) {
      return {
        codigo: String(prod2[0].item_id),
        descripcion:
          String(prod2[0].nombre ?? "").trim() || `ITEM ${prod2[0].item_id}`,
      };
    }

    return null;
  };

  const ask = (p: Pick) => {
    setPick(p);
    setQty(1);
    setOpen(true);
  };

  const apply = async (mode: "FALTA" | "SOBRA") => {
    if (!grupo || !pick) return;

    const n = Math.max(1, Number(qty || 1));
    const delta = mode === "SOBRA" ? n : -n;

    setOpen(false);
    try {
      await addManualMovimiento({
        grupo,
        etiqueta: null,
        codigo: pick.codigo,
        descripcion: pick.descripcion,
        delta,
      });

      await load();
      setQ("");
    } catch {
      Alert.alert("Error", "No se pudo guardar.");
    } finally {
      setPick(null);
    }
  };

  const handleTextOrScan = async (raw: string) => {
    if (!grupo) return;

    const digits = String(raw ?? "")
      .trim()
      .replace(/\D/g, "");
    if (!digits) return;

    const p = await buscarProductoEnConsulta(digits);
    if (!p) {
      Alert.alert(
        "No encontrado",
        `El código/EAN ${digits} no existe en “consulta códigos”.`
      );
      return;
    }
    ask(p);
  };

  const onChangeSmart = (t: string) => {
    if (t.includes("\n") || t.includes("\r")) {
      const cleaned = t.replace(/[\r\n]/g, "");
      setQ(cleaned);
      handleTextOrScan(cleaned);
      return;
    }
    setQ(t);
  };

  const openCamera = async () => {
    if (!perm?.granted) {
      const r = await requestPerm();
      if (!r.granted) {
        Alert.alert("Permiso", "No se dio permiso de cámara.");
        return;
      }
    }
    setCamOpen(true);
  };

  const onBarcodeScanned = async (res: { data: string }) => {
    if (camBusy) return;
    setCamBusy(true);
    try {
      setCamOpen(false);
      await handleTextOrScan(res.data);
    } finally {
      setTimeout(() => setCamBusy(false), 600);
    }
  };

  if (!grupo || !grupoLabel) {
    return (
      <View style={styles.center}>
        <Text style={{ fontWeight: "900" }}>Faltan parámetros</Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { paddingBottom: 16 + insets.bottom }]}
    >
      <Text style={styles.title}>{grupoLabel}</Text>

      <View style={styles.searchWrap}>
        <TextInput
          value={q}
          onChangeText={onChangeSmart}
          placeholder="Buscar / escanear código o EAN…"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (qDigits) handleTextOrScan(qDigits);
          }}
        />

        <Pressable style={styles.iconBtn} onPress={openCamera}>
          <MaterialCommunityIcons
            name="camera-outline"
            size={22}
            color="#fff"
          />
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => `${i.codigo}`}
        contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
        renderItem={({ item }) => {
          const isSobra = item.saldo > 0;
          return (
            <Pressable
              style={[styles.row, isSobra ? styles.rowSobra : styles.rowFalta]}
              onPress={() =>
                ask({ codigo: item.codigo, descripcion: item.descripcion })
              }
            >
              <Text style={styles.desc}>{item.descripcion}</Text>
              <Text style={styles.meta}>
                Código: {item.codigo} —{" "}
                {isSobra
                  ? `Sobra +${item.saldo}`
                  : `Falta ${Math.abs(item.saldo)}`}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Aún no hay movimientos manuales en esta carpeta.
          </Text>
        }
      />

      {/* ✅ Botón Guardar (ya no tapa la barra de Android) */}
      <Pressable
        style={[styles.saveBtn, { bottom: 12 + insets.bottom }]}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.saveBtnText}>Guardar</Text>
      </Pressable>

      {/* Modal Falta/Sobra */}
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Falta o sobra?</Text>
            <Text style={styles.modalSub}>{pick?.descripcion}</Text>

            <View style={{ marginTop: 14, alignItems: "center" }}>
              <BultosStepper
                value={qty}
                onMinus={() => setQty((v) => Math.max(1, v - 1))}
                onPlus={() => setQty((v) => v + 1)}
              />
              <Text style={{ marginTop: 8, opacity: 0.7 }}>Cantidad</Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.btnRed]}
                onPress={() => apply("FALTA")}
              >
                <Text style={styles.modalBtnTextPrimary}>Falta</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.btnGreen]}
                onPress={() => apply("SOBRA")}
              >
                <Text style={styles.modalBtnTextPrimary}>Sobra</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setOpen(false)}
              style={{
                marginTop: 10,
                backgroundColor: "#191616ff",
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#ddd",
              }}
            >
              <Text
                style={{ color: "#ffffffff", fontWeight: "900", fontSize: 16 }}
              >
                Cancelar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal cámara */}
      <Modal
        transparent
        visible={camOpen}
        animationType="fade"
        onRequestClose={() => setCamOpen(false)}
      >
        <View style={styles.camWrap}>
          <View style={styles.camHeader}>
            <Text style={styles.camTitle}>Escanear</Text>
            <Pressable onPress={() => setCamOpen(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
          <CameraView style={{ flex: 1 }} onBarcodeScanned={onBarcodeScanned} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  container: { flex: 1, padding: 16, backgroundColor: "#f4f4f4" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 10 },

  searchWrap: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  search: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e6e6e6",
  },
  iconBtn: { backgroundColor: "#111", padding: 10, borderRadius: 12 },

  row: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
  },
  rowSobra: { borderColor: "#3fc146ff" },
  rowFalta: { borderColor: "#e23030ff" },

  desc: { fontWeight: "900" },
  meta: { opacity: 0.7, marginTop: 4 },
  empty: { textAlign: "center", marginTop: 20, opacity: 0.6 },

  saveBtn: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "900" },

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

  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  modalBtnTextPrimary: { color: "#fff", fontWeight: "800" },

  btnRed: { backgroundColor: "#c62828" },
  btnGreen: { backgroundColor: "#26b22dff" },

  camWrap: { flex: 1, backgroundColor: "#000" },
  camHeader: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  camTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
