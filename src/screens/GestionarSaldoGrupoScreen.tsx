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
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { getDb } from "../database/db";
import { listarSaldoPorGrupo } from "../database/saldo";
import BultosStepper from "../components/BultosStepper";

type Item = { codigo: string; descripcion: string | null; saldo: number };

async function tableColumns(db: any, table: string): Promise<Set<string>> {
  const info = (await db.getAllAsync(`PRAGMA table_info(${table});`)) as Array<{ name: string }>;
  return new Set((info ?? []).map((r) => r.name));
}

async function ensureColumn(db: any, table: string, colName: string, colDef: string) {
  const cols = await tableColumns(db, table);
  if (!cols.has(colName)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
  }
}

async function ensureSaldoSchema(db: any) {
  // saldo_global
  await ensureColumn(db, "saldo_global", "grupo", "grupo TEXT");
  await ensureColumn(db, "saldo_global", "descripcion", "descripcion TEXT");
  await ensureColumn(db, "saldo_global", "updated_at", "updated_at TEXT");

  // saldo_movimientos (mejor esfuerzo)
  try {
    await ensureColumn(db, "saldo_movimientos", "grupo", "grupo TEXT");
  } catch {}
}

export default function GestionarSaldoGrupoScreen({ route }: any) {
  const { grupo, label } = route.params as { grupo: string; label?: string };
  const labelGrupo = useMemo(() => label ?? grupo, [label, grupo]);

  const [items, setItems] = useState<Item[]>([]);
  const [editMode, setEditMode] = useState(false);

  // PIN
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);

  // Modal editor (estilo Repaso)
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [tempAbs, setTempAbs] = useState(0); // magnitud
  const [tempSign, setTempSign] = useState<"sobra" | "falta">("sobra"); // signo

  const load = useCallback(async () => {
    const list = await listarSaldoPorGrupo(grupo);
    setItems(list);
  }, [grupo]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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

  const pedirPin = () => {
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
    setEditMode(true);
  };

  // Ajuste por delta (suma/resta) y si queda en 0 lo borra
  const aplicarDelta = async (codigo: string, delta: number) => {
    const db = await getDb();
    await ensureSaldoSchema(db);

    const now = new Date().toISOString();

    await db.execAsync("BEGIN");
    try {
      const rows = await db.getAllAsync<{ saldo: number }>(
        `SELECT saldo FROM saldo_global WHERE grupo = ? AND codigo = ? LIMIT 1;`,
        [grupo, codigo]
      );

      const cur = Number(rows?.[0]?.saldo ?? 0);
      const next = cur + delta;

      if (next === 0) {
        await db.runAsync(`DELETE FROM saldo_global WHERE grupo = ? AND codigo = ?;`, [grupo, codigo]);
      } else if (rows.length) {
        await db.runAsync(
          `UPDATE saldo_global SET saldo = ?, updated_at = ? WHERE grupo = ? AND codigo = ?;`,
          [next, now, grupo, codigo]
        );
      } else {
        await db.runAsync(
          `INSERT INTO saldo_global (grupo, codigo, descripcion, saldo, updated_at)
           VALUES (?, ?, NULL, ?, ?);`,
          [grupo, codigo, next, now]
        );
      }

      // movimiento (si existe columna grupo)
      try {
        await db.runAsync(
          `INSERT INTO saldo_movimientos (grupo, etiqueta, codigo, delta, created_at)
           VALUES (?, NULL, ?, ?, ?);`,
          [grupo, codigo, delta, now]
        );
      } catch {
        try {
          await db.runAsync(
            `INSERT INTO saldo_movimientos (etiqueta, codigo, delta, created_at)
             VALUES (NULL, ?, ?, ?);`,
            [codigo, delta, now]
          );
        } catch {}
      }

      await db.execAsync("COMMIT");

      setItems((prev) => {
        const idx = prev.findIndex((x) => x.codigo === codigo);
        const curSaldo = idx >= 0 ? Number(prev[idx].saldo ?? 0) : 0;
        const nextSaldo = curSaldo + delta;

        if (nextSaldo === 0) return prev.filter((x) => x.codigo !== codigo);

        if (idx >= 0) {
          const updated = { ...prev[idx], saldo: nextSaldo };
          const rest = prev.filter((x) => x.codigo !== codigo);
          return [updated, ...rest]; // sube arriba
        }

        return [{ codigo, descripcion: null, saldo: delta }, ...prev];
      });
    } catch (e: any) {
      await db.execAsync("ROLLBACK");
      Alert.alert("Error", `No se pudo editar.\n${String(e?.message ?? e)}`);
    }
  };

  const openEditor = (it: Item) => {
    setSelected(it);

    const s = Number(it.saldo ?? 0);
    if (s >= 0) {
      setTempSign("sobra");
      setTempAbs(Math.abs(s));
    } else {
      setTempSign("falta");
      setTempAbs(Math.abs(s));
    }

    setOpen(true);
  };

  const saveEditor = async () => {
    if (!selected) return;

    const cur = Number(selected.saldo ?? 0);
    const target = (tempSign === "sobra" ? 1 : -1) * Number(tempAbs ?? 0);

    const delta = target - cur;
    if (delta === 0) {
      setOpen(false);
      setSelected(null);
      return;
    }

    await aplicarDelta(selected.codigo, delta);

    setOpen(false);
    setSelected(null);
  };

  const deleteEditor = async () => {
    if (!selected) return;

    Alert.alert("Eliminar", "¿Dejar este item en 0 (quitar de la lista)?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const cur = Number(selected.saldo ?? 0);
          if (!cur) return;

          await aplicarDelta(selected.codigo, -cur);

          setOpen(false);
          setSelected(null);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Gestionar</Text>
          <Text style={styles.sub}>Carpeta: {labelGrupo}</Text>
        </View>

        <Pressable
          style={[styles.editBtn, editMode && styles.editBtnOn]}
          onPress={() => (editMode ? setEditMode(false) : pedirPin())}
        >
          <MaterialCommunityIcons
            name={editMode ? "pencil-off-outline" : "pencil-outline"}
            size={22}
            color="#fff"
          />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.codigo}
        renderItem={({ item }) => {
          const isSobra = item.saldo > 0;

          return (
            <Pressable
              style={[styles.itemCard, isSobra ? styles.cardGreen : styles.cardRed]}
              onPress={() => (editMode ? openEditor(item) : null)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.desc}>{item.descripcion ?? "(sin descripción)"}</Text>
                <Text style={styles.meta}>
                  Código: {item.codigo} — {isSobra ? `Sobra: +${item.saldo}` : `Falta: ${Math.abs(item.saldo)}`}
                </Text>
              </View>

              {editMode ? (
                <MaterialCommunityIcons name="chevron-right" size={26} color="#111" />
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No hay incidencias en esta carpeta.</Text>}
      />

      {/* PIN */}
      <Modal transparent visible={pinOpen} animationType="fade" onRequestClose={() => setPinOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>PIN de encargado</Text>
            <Text style={styles.modalSub}>Introduce el PIN para editar.</Text>

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
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setPinOpen(false)}>
                <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
              </Pressable>

              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={confirmarPin}>
                <Text style={styles.modalBtnTextPrimary}>Confirmar</Text>
              </Pressable>
            </View>

            <Text style={styles.hint}>PIN por defecto: 1234</Text>
          </View>
        </View>
      </Modal>

      {/* Editor (estilo Repaso) */}
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selected?.descripcion ?? "Editar"}</Text>
            <Text style={styles.modalSub}>Código: {selected?.codigo}</Text>

            <View style={styles.signRow}>
              <Pressable
                style={[styles.signBtn, tempSign === "falta" && styles.signBtnOnRed]}
                onPress={() => setTempSign("falta")}
              >
                <Text style={[styles.signTxt, tempSign === "falta" && styles.signTxtOn]}>Falta</Text>
              </Pressable>

              <Pressable
                style={[styles.signBtn, tempSign === "sobra" && styles.signBtnOnGreen]}
                onPress={() => setTempSign("sobra")}
              >
                <Text style={[styles.signTxt, tempSign === "sobra" && styles.signTxtOn]}>Sobra</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 14, alignItems: "center" }}>
              <BultosStepper
                value={tempAbs}
                onMinus={() => setTempAbs((v) => Math.max(0, v - 1))}
                onPlus={() => setTempAbs((v) => v + 1)}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setOpen(false)}>
                <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
              </Pressable>

              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveEditor}>
                <Text style={styles.modalBtnTextPrimary}>Guardar</Text>
              </Pressable>
            </View>

            <Pressable style={styles.deleteBtn} onPress={deleteEditor}>
              <Text style={styles.deleteTxt}>Eliminar (dejar en 0)</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f4f4f4" },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "900" },
  sub: { marginTop: 4, opacity: 0.7 },

  editBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  editBtnOn: { backgroundColor: "#1f6feb" },

  itemCard: { backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 2, flexDirection: "row", gap: 10, alignItems: "center" },
  cardGreen: { borderColor: "#2e7d32" },
  cardRed: { borderColor: "#c62828" },
  desc: { fontWeight: "800" },
  meta: { opacity: 0.7, marginTop: 4 },

  empty: { textAlign: "center", marginTop: 16, opacity: 0.6 },

  // PIN + editor modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 14 },
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

  signRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  signBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: "#eee" },
  signBtnOnRed: { backgroundColor: "#c62828" },
  signBtnOnGreen: { backgroundColor: "#2e7d32" },
  signTxt: { fontWeight: "900", opacity: 0.85 },
  signTxtOn: { color: "#fff", opacity: 1 },

  deleteBtn: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  deleteTxt: { color: "#c62828", fontWeight: "900" },
});
