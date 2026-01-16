import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getDb } from "../database/db";
import { MaterialCommunityIcons } from "@expo/vector-icons";

async function ensureColumn(db: any, table: string, colName: string, colDef: string) {
  const info = (await db.getAllAsync(`PRAGMA table_info(${table});`)) as Array<{ name: string }>;
  const exists = (info ?? []).some((r) => r.name === colName);
  if (!exists) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
  }
}

export default function ListaAlbaranesScreen({ navigation }: any) {
  const [albaranes, setAlbaranes] = useState<
    Array<{
      id: number;
      etiqueta: string;
      created_at: string | null;
      finished_at: string | null;
      archived_at?: string | null;
    }>
  >([]);

  // modal crear albarán vacío
  const [openCrear, setOpenCrear] = useState(false);
  const [etiquetaTxt, setEtiquetaTxt] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();

    // ✅ columna para “ocultar” albaranes finalizados sin tocar saldo
    await ensureColumn(db, "albaranes", "archived_at", "archived_at TEXT");

    const rows = await db.getAllAsync(
      `SELECT id, etiqueta, created_at, finished_at, archived_at
       FROM albaranes
       WHERE archived_at IS NULL
       ORDER BY id DESC;`
    );

    setAlbaranes(rows as any);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const archivarAlbaranFinalizado = async (id: number) => {
    const db = await getDb();
    const now = new Date().toISOString();

    await db.execAsync("BEGIN");
    try {
      // 1) ocultar el albarán (sale de la lista)
      await db.runAsync(`UPDATE albaranes SET archived_at = ? WHERE id = ?;`, [now, id]);

      // 2) opcional: borrar líneas para ahorrar espacio (NO afecta saldo)
      await db.runAsync(`DELETE FROM albaran_items WHERE albaran_id = ?;`, [id]);

      // ✅ NO tocar saldo_movimientos (para que faltas/sobras sigan)
      await db.execAsync("COMMIT");
      await load();
    } catch {
      await db.execAsync("ROLLBACK");
      Alert.alert("Error", "No se pudo archivar.");
    }
  };

  const borrarAlbaranNoFinalizado = async (id: number) => {
    const db = await getDb();

    await db.execAsync("BEGIN");
    try {
      await db.runAsync(`DELETE FROM albaran_items WHERE albaran_id = ?;`, [id]);
      await db.runAsync(`DELETE FROM albaranes WHERE id = ?;`, [id]);
      await db.execAsync("COMMIT");
      await load();
    } catch {
      await db.execAsync("ROLLBACK");
      Alert.alert("Error", "No se pudo borrar.");
    }
  };

  const onTrash = (id: number, etiqueta: string, finishedAt: string | null) => {
    if (finishedAt) {
      Alert.alert(
        "Quitar de la lista",
        `Este albarán está FINALIZADO.\n\nSi lo quitas de la lista, las faltas/sobras se mantienen (solo el encargado las borra).`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Quitar", style: "destructive", onPress: () => archivarAlbaranFinalizado(id) },
        ]
      );
    } else {
      Alert.alert("Eliminar albarán", `¿Seguro que quieres eliminar el albarán ${etiqueta}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => borrarAlbaranNoFinalizado(id) },
      ]);
    }
  };

  // ✅ crear (o abrir) albarán vacío por etiqueta
  const crearAlbaranVacio = async () => {
    if (creating) return;

    const et = etiquetaTxt.trim().replace(/\D/g, "");
    if (!et) {
      Alert.alert("Falta etiqueta", "Escribe una etiqueta válida (solo números).");
      return;
    }

    setCreating(true);
    try {
      const db = await getDb();
      await ensureColumn(db, "albaranes", "archived_at", "archived_at TEXT");

      const exists = (await db.getAllAsync(
        `SELECT id, finished_at, archived_at FROM albaranes WHERE etiqueta = ? LIMIT 1;`,
        [et]
      )) as Array<{ id: number; finished_at: string | null; archived_at: string | null }>;

      if (exists.length) {
        const row = exists[0];

        // si estaba oculto (archived), puedes reactivarlo
        if (row.archived_at) {
          Alert.alert(
            "Ya existe",
            "Ese albarán ya existía y estaba oculto. ¿Quieres reactivarlo en la lista?",
            [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Reactivar",
                onPress: async () => {
                  const db2 = await getDb();
                  await db2.runAsync(`UPDATE albaranes SET archived_at = NULL WHERE id = ?;`, [row.id]);
                  setOpenCrear(false);
                  setEtiquetaTxt("");
                  await load();
                  navigation.navigate("RepasoAlbaran", { albaranId: row.id });
                },
              },
            ]
          );
          return;
        }

        // si ya está finalizado: avisa y deja ver
        if (row.finished_at) {
          Alert.alert("Ya finalizado", "Este albarán ya está finalizado. Puedes entrar a verlo.", [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Ver",
              onPress: () => {
                setOpenCrear(false);
                setEtiquetaTxt("");
                navigation.navigate("RepasoAlbaran", { albaranId: row.id });
              },
            },
          ]);
          return;
        }

        // existe y no está finalizado -> abrir
        setOpenCrear(false);
        setEtiquetaTxt("");
        navigation.navigate("RepasoAlbaran", { albaranId: row.id });
        return;
      }

      // crear nuevo
      const now = new Date().toISOString();
      const res: any = await db.runAsync(
        `INSERT INTO albaranes (etiqueta, created_at, finished_at, archived_at)
         VALUES (?, ?, NULL, NULL);`,
        [et, now]
      );

      const newId = Number(res?.lastInsertRowId);
      setOpenCrear(false);
      setEtiquetaTxt("");
      await load();
      navigation.navigate("RepasoAlbaran", { albaranId: newId });
    } catch {
      Alert.alert("Error", "No se pudo crear el albarán vacío.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ✅ título + botones */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>Repasar albaranes</Text>

        <View style={styles.actions}>
          {/* seguir añadiendo albaranes */}
          <Pressable style={styles.actionBtn} onPress={() => navigation.navigate("ImportarAlbaranes")}>
            <MaterialCommunityIcons name="plus-box-outline" size={22} color="#fff" />
          </Pressable>

          {/* crear albarán vacío */}
          <Pressable style={styles.actionBtn} onPress={() => setOpenCrear(true)}>
            <MaterialCommunityIcons name="file-plus-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={albaranes}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable style={styles.info} onPress={() => navigation.navigate("RepasoAlbaran", { albaranId: item.id })}>
              <Text style={styles.label}>
                Etiqueta: <Text style={styles.value}>{item.etiqueta}</Text>
              </Text>
              <Text style={styles.date}>{item.created_at}</Text>
              {item.finished_at && <Text style={styles.done}>Finalizado: {item.finished_at.split("T")[0]}</Text>}
            </Pressable>

            <Pressable style={styles.trashBtn} onPress={() => onTrash(item.id, item.etiqueta, item.finished_at)}>
              <MaterialCommunityIcons name="trash-can-outline" size={26} color="#d32f2f" />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay albaranes cargados.</Text>}
      />

      {/* ✅ modal crear albarán vacío */}
      <Modal transparent visible={openCrear} animationType="fade" onRequestClose={() => setOpenCrear(false)}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Crear albarán vacío</Text>
              <Text style={styles.modalSub}>Escribe la etiqueta (número). Luego podrás escanear productos y finalizar.</Text>

              <TextInput
                value={etiquetaTxt}
                onChangeText={setEtiquetaTxt}
                placeholder="Ej: 123456"
                keyboardType="number-pad"
                style={styles.input}
                autoFocus
              />

              <View style={styles.modalActions}>
                <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setOpenCrear(false)}>
                  <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalBtn, styles.modalBtnPrimary, creating && { opacity: 0.6 }]}
                  disabled={creating}
                  onPress={crearAlbaranVacio}
                >
                  <Text style={styles.modalBtnTextPrimary}>{creating ? "Creando..." : "Crear"}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f4f4f4" },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "800" },

  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#eee",
  },
  info: { flex: 1 },
  label: { fontWeight: "800" },
  value: { fontWeight: "900" },
  date: { opacity: 0.6, fontSize: 13, marginTop: 2 },
  done: { fontSize: 12, color: "#2e7d32", marginTop: 4 },
  trashBtn: { padding: 6, marginLeft: 6 },
  empty: { textAlign: "center", marginTop: 30, opacity: 0.6 },

  // modal
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
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
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  modalBtnGhost: { backgroundColor: "#eee" },
  modalBtnPrimary: { backgroundColor: "#111" },
  modalBtnTextGhost: { fontWeight: "800" },
  modalBtnTextPrimary: { color: "#fff", fontWeight: "800" },
});
