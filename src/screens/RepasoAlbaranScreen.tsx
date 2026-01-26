import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

import BultosStepper from "../components/BultosStepper";
import { getDb } from "../database/db";
import { finalizarAlbaran } from "../database/saldo";

const CARPETAS = [
  { key: "refrigerado", label: "Refrigerado" },
  { key: "congelado", label: "Congelado" },
  { key: "seco", label: "Seco" },
  { key: "almacen_central", label: "Almacén central" },
  { key: "fruta_verdura", label: "Fruta y verdura" },
  { key: "pollo_carne", label: "Pollo y carne" },
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
  // ✅ Lote
  const [modoLote, setModoLote] = useState(false);
  const [rememberLote, setRememberLote] = useState(false);
  const [loteQty, setLoteQty] = useState(1);

  // ✅ Undo
  const [undoAction, setUndoAction] = useState<{
    itemId: number;
    inc: number;
  } | null>(null);

  // ✅ Modal reutilizado para Lote
  const [modalMode, setModalMode] = useState<"edit" | "lote">("edit");

  const lastScanRef = useRef<{ key: String; t: number } | null>(null);
  const { albaranId } = route.params;

  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<Item[]>([]);
  const [loadingFin, setLoadingFin] = useState(false);

  const [etiqueta, setEtiqueta] = useState<string>("");
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const isFinalizado = !!finishedAt;

  const [q, setQ] = useState("");
  const qDigits = useMemo(() => q.trim().replace(/\D/g, ""), [q]);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [tempValue, setTempValue] = useState(0);

  // modal carpeta al finalizar
  const [carpetaOpen, setCarpetaOpen] = useState(false);

  const scanQueueRef = useRef<string[]>([]);

  // ✅ cámara (igual que en ManualFaltasEditor)
  const [perm, requestPerm] = useCameraPermissions();
  const [camOpen, setCamOpen] = useState(false);
  const [camBusy, setCamBusy] = useState(false);

  const openCamera = async () => {
    if (isFinalizado) return;
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
      await handleScan(res.data);
    } finally {
      setTimeout(() => setCamBusy(false), 600);
    }
  };

  const normalizarEAN13 = (raw: string) => {
    const d = String(raw ?? "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length === 13) return d;
    if (d.length < 13) return d.padStart(13, "0");
    return d.slice(-13);
  };

  const load = async () => {
    const db = await getDb();

    const cab = await db.getAllAsync<{
      etiqueta: string;
      finished_at: string | null;
    }>(`SELECT etiqueta, finished_at FROM albaranes WHERE id = ? LIMIT 1;`, [
      albaranId,
    ]);
    setEtiqueta(cab?.[0]?.etiqueta ?? "");
    setFinishedAt(cab?.[0]?.finished_at ?? null);

    const rows = await db.getAllAsync<Item>(
      `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
       FROM albaran_items
       WHERE albaran_id = ?
       ORDER BY id ASC;`,
      [albaranId],
    );
    setItems(rows);
  };

  useEffect(() => {
    load();
  }, [albaranId]);

  const norm = (s: string) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const filtered = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return items;

    return items.filter(
      (it) => norm(it.codigo).includes(s) || norm(it.descripcion).includes(s),
    );
  }, [q, items]);

  const resumen = useMemo(() => {
    let esp = 0;
    let rev = 0;

    for (const it of items) {
      esp += Number(it.bultos_esperados ?? 0);
      rev += Number(it.bultos_revisados ?? 0);
    }

    const diff = rev - esp;
    return {
      esp,
      rev,
      faltan: diff < 0 ? Math.abs(diff) : 0,
      sobran: diff > 0 ? diff : 0,
    };
  }, [items]);

  const openStepper = (it: Item) => {
    setModalMode("edit");
    setSelected(it);
    setTempValue(Number(it.bultos_revisados ?? 0));
    setOpen(true);
  };

  const openLoteModal = (it: Item) => {
    setModalMode("lote");
    setSelected(it);
    setTempValue(rememberLote ? Math.max(1, loteQty) : 1);
    setOpen(true);
  };

  const saveStepper = async () => {
    if (!selected) return;
    const db = await getDb();

    if (modalMode === "lote") {
      const inc = Math.max(0, Number(tempValue ?? 0));
      if (inc <= 0) {
        setOpen(false);
        setSelected(null);
        setModoLote(false);
        setModalMode("edit");
        return;
      }

      // reutiliza tu misma función de incremento (si ya la tienes)
      await incBulto(selected, inc);

      if (rememberLote) setLoteQty(inc);

      setUndoAction({ itemId: selected.id, inc });
      setTimeout(() => setUndoAction(null), 4500);

      setScanMsg(`+${inc}  ${selected.descripcion ?? ""}`.trim());
      setTimeout(() => setScanMsg(null), 900);

      setOpen(false);
      setSelected(null);
      setModoLote(false);
      setModalMode("edit");
      return;
    }

    // modo normal (tu comportamiento actual)
    await db.runAsync(
      `UPDATE albaran_items SET bultos_revisados = ? WHERE id = ?;`,
      [tempValue, selected.id],
    );

    setItems((prev) =>
      prev.map((x) =>
        x.id === selected.id ? { ...x, bultos_revisados: tempValue } : x,
      ),
    );

    setOpen(false);
    setSelected(null);
  };

  const incBulto = async (it: Item, inc = 1) => {
    const db = await getDb();

    await db.runAsync(
      `UPDATE albaran_items
       SET bultos_revisados = bultos_revisados + ?
       WHERE id = ?;`,
      [inc, it.id],
    );

    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === it.id);

      const updated =
        idx >= 0
          ? {
              ...prev[idx],
              bultos_revisados: Number(prev[idx].bultos_revisados ?? 0) + inc,
            }
          : { ...it, bultos_revisados: Number(it.bultos_revisados ?? 0) + inc };

      const rest = idx >= 0 ? prev.filter((x) => x.id !== it.id) : prev;

      // 👇 lo movemos arriba
      return [updated, ...rest];
    });
  };

  const resolverItemDesdeEAN = async (eanRaw: string): Promise<Item | null> => {
    const db = await getDb();
    const ean13 = normalizarEAN13(eanRaw);

    // 1) Match exacto (soporta ean único o lista "a,b,c")
    const prodExact = await db.getAllAsync<{
      item_id: number;
      nombre: string;
      ean?: string;
    }>(
      `
    SELECT item_id, nombre, ean
    FROM productos
    WHERE ean = ? OR ean = ?
       OR (',' || REPLACE(REPLACE(ean,' ',''),';',',') || ',') LIKE '%,' || ? || ',%'
       OR (',' || REPLACE(REPLACE(ean,' ',''),';',',') || ',') LIKE '%,' || ? || ',%'
    LIMIT 1;
    `,
      [eanRaw, ean13, eanRaw, ean13],
    );

    let itemId: number | null = prodExact?.[0]?.item_id ?? null;
    let nombre: string = (prodExact?.[0]?.nombre ?? "").trim();

    // 2) Si no existe y empieza por 2 => EAN variable (carne/pollo)
    if (itemId == null && ean13.startsWith("2")) {
      const key7 = ean13.slice(0, 7); // ej: 2500256 / 2500462

      const cands = await db.getAllAsync<{
        item_id: number;
        nombre: string;
        ean: string;
      }>(
        `
      SELECT item_id, nombre, ean
      FROM productos
      WHERE REPLACE(REPLACE(ean,' ',''),';',',') LIKE ?
      LIMIT 50;
      `,
        [`%${key7}%`],
      );

      const matches = (cands ?? []).filter((r) => {
        const tokens = String(r.ean ?? "")
          .replace(/[;\s]+/g, ",")
          .split(",")
          .map((t) => t.replace(/\D/g, ""))
          .filter(Boolean);

        return tokens.some(
          (t) => t.startsWith(key7) && t.startsWith("2") && t.length >= 13,
        );
      });

      if (matches.length >= 1) {
        if (matches.length > 1) {
          Alert.alert(
            "EAN variable (carne/pollo)",
            `Encontré ${matches.length} posibles. Usaré: ${matches[0].nombre} (código ${matches[0].item_id}).`,
          );
        }
        itemId = matches[0].item_id;
        nombre = String(matches[0].nombre ?? "").trim();
      }
    }

    if (itemId == null) {
      Alert.alert(
        "No encontrado",
        `EAN ${ean13} no existe en consulta códigos.`,
      );
      return null;
    }

    // ya existe en memoria?
    const inMemory = items.find((x) => x.item_id === itemId);
    if (inMemory) return inMemory;

    // ya existe en albaran_items?
    const existing = await db.getAllAsync<Item>(
      `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
     FROM albaran_items
     WHERE albaran_id = ? AND item_id = ?
     LIMIT 1;`,
      [albaranId, itemId],
    );

    if (existing.length > 0) {
      const row = existing[0];
      setItems((prev) =>
        prev.some((x) => x.id === row.id) ? prev : [row, ...prev],
      );
      return row;
    }

    // crear EXTRA
    const desc = nombre || `ITEM ${itemId}`;
    const insertRes: any = await db.runAsync(
      `INSERT INTO albaran_items (albaran_id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta)
     VALUES (?, ?, ?, ?, 0, 0, 0);`,
      [albaranId, itemId, String(itemId), desc],
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

    setItems((prev) => [newItem, ...prev]);
    return newItem;
  };

  const resolverItemDesdeCodigoCorto = async (
    raw: string,
  ): Promise<Item | null> => {
    const db = await getDb();
    const digits = String(raw ?? "")
      .trim()
      .replace(/\D/g, "");
    const itemId = Number(digits);
    if (!digits || !Number.isFinite(itemId) || itemId <= 0) return null;

    const inMemory = items.find(
      (x) => x.item_id === itemId || x.codigo === digits,
    );
    if (inMemory) return inMemory;

    const prod = await db.getAllAsync<{ item_id: number; nombre: string }>(
      `SELECT item_id, nombre FROM productos WHERE item_id = ? LIMIT 1;`,
      [itemId],
    );

    const nombre = (prod?.[0]?.nombre ?? "").trim();
    if (!prod?.[0]?.item_id) {
      Alert.alert(
        "No encontrado",
        `El código ${digits} no existe en consulta códigos.`,
      );
      return null;
    }

    const existing = await db.getAllAsync<Item>(
      `SELECT id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta
       FROM albaran_items
       WHERE albaran_id = ? AND item_id = ?
       LIMIT 1;`,
      [albaranId, itemId],
    );

    if (existing.length > 0) {
      const row = existing[0];
      setItems((prev) =>
        prev.some((x) => x.id === row.id) ? prev : [row, ...prev],
      );
      return row;
    }

    const desc = nombre || `ITEM ${itemId}`;

    const insertRes: any = await db.runAsync(
      `INSERT INTO albaran_items (albaran_id, item_id, codigo, descripcion, bultos_esperados, bultos_revisados, falta)
       VALUES (?, ?, ?, ?, 0, 0, 0);`,
      [albaranId, itemId, String(itemId), desc],
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

    setItems((prev) => [newItem, ...prev]);
    return newItem;
  };

  const handleScan = async (raw: string) => {
    const now = Date.now();

    // normaliza una sola vez
    const digits = String(raw ?? "")
      .trim()
      .replace(/\D/g, "");
    if (!digits) return;

    // anti doble lectura (EAN o código corto)
    const key =
      digits.length >= 12 ? normalizarEAN13(digits).slice(-13) : digits;

    const last = lastScanRef.current;
    if (last && last.key === key && now - last.t < 180) {
      setQ("");
      return;
    }
    lastScanRef.current = { key, t: now };

    if (isFinalizado) {
      Alert.alert("Finalizado", "Este albarán ya está finalizado.");
      setQ("");
      return;
    }
    if (scannerLocked) {
      scanQueueRef.current.push(raw);
      return;
    }
    setScannerLocked(true);

    try {
      const eanCandidate = digits.length >= 13 ? digits.slice(-13) : digits;

      if (eanCandidate.length >= 12) {
        const it = await resolverItemDesdeEAN(eanCandidate);
        if (!it) return;

        // ✅ si está en modo lote, abre el modal y NO suma +1
        if (modoLote) {
          openLoteModal(it);
          setQ("");
          return;
        }

        await incBulto(it, 1);

        // ✅ para deshacer
        setUndoAction({ itemId: it.id, inc: 1 });
        setTimeout(() => setUndoAction(null), 4500);
        setScanMsg(
          `+1  ${it.descripcion}${
            Number(it.bultos_esperados ?? 0) === 0 ? " (EXTRA)" : ""
          }`,
        );
        setTimeout(() => setScanMsg(null), 900);
        setQ("");
        return;
      }

      const it = await resolverItemDesdeCodigoCorto(digits);
      if (!it) return;

      if (modoLote) {
        openLoteModal(it);
        setQ("");
        return;
      }

      await incBulto(it, 1);
      setUndoAction({ itemId: it.id, inc: 1 });
      setTimeout(() => setUndoAction(null), 4500);

      setScanMsg(
        `+1  ${it.descripcion}${
          Number(it.bultos_esperados ?? 0) === 0 ? " (EXTRA)" : ""
        }`,
      );
      setTimeout(() => setScanMsg(null), 900);
      setQ("");
    } finally {
      setScannerLocked(false);

      const next = scanQueueRef.current.shift();
      if (next) setTimeout(() => handleScan(next), 0);
    }
  };

  // ✅ Finalizar primero pide carpeta
  const onFinalizar = () => {
    if (isFinalizado) {
      Alert.alert("Info", "Este albarán ya estaba finalizado.");
      return;
    }
    setCarpetaOpen(true);
  };

  const finalizarEnCarpeta = (carpetaKey: string, carpetaLabel: string) => {
    setCarpetaOpen(false);

    Alert.alert(
      "Guardar incidencias",
      `¿Guardar faltas/sobras en: ${carpetaLabel}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, finalizar",
          style: "destructive",
          onPress: async () => {
            if (loadingFin) return;
            setLoadingFin(true);
            try {
              const res = await finalizarAlbaran(albaranId, carpetaKey);

              if (res.already) {
                Alert.alert("Info", "Este albarán ya estaba finalizado.");
                await load();
              } else {
                await load();
                Alert.alert(
                  "Guardado",
                  `Carpeta: ${carpetaLabel}\nFaltan: ${res.faltan}\nSobran: ${res.sobran}\nLíneas con incidencia: ${res.tocados}`,
                  [
                    {
                      text: "Ver faltas y sobras",
                      onPress: () => navigation.navigate("FaltasYSobras"),
                    },
                    { text: "OK" },
                  ],
                );
              }
            } catch {
              Alert.alert("Error", "No se pudo finalizar.");
            } finally {
              setLoadingFin(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingBottom: 16 + insets.bottom }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Repaso</Text>

        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {resumen.rev}/{resumen.esp}
            {resumen.faltan > 0 ? `  ·  Faltan ${resumen.faltan}` : ""}
            {resumen.sobran > 0 ? `  ·  Sobran ${resumen.sobran}` : ""}
          </Text>
        </View>
      </View>

      {etiqueta ? (
        <Text style={styles.subtitle}>Etiqueta: {etiqueta}</Text>
      ) : null}
      {isFinalizado ? (
        <Text style={styles.done}>Finalizado: {finishedAt?.split("T")[0]}</Text>
      ) : null}

      <View style={styles.searchWrap}>
        <Pressable
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: modoLote ? "#111" : "#eee",
            borderWidth: 1,
            borderColor: modoLote ? "#111" : "#d6d6d6",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => setModoLote((v) => !v)}
        >
          <Text
            style={{ fontWeight: "800", color: modoLote ? "#fff" : "#111" }}
          >
            +
          </Text>
        </Pressable>

        <View style={styles.searchField}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por código o escanear EAN…"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isFinalizado}
            returnKeyType="done"
            onSubmitEditing={() => handleScan(q)}
          />

          {q.length > 0 && !isFinalizado && (
            <Pressable style={styles.searchClear} onPress={() => setQ("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={20}
                color="#666"
              />
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.iconBtn, isFinalizado && styles.btnDisabled]}
          disabled={isFinalizado}
          onPress={openCamera}
        >
          <MaterialCommunityIcons
            name="camera-outline"
            size={22}
            color="#fff"
          />
        </Pressable>
      </View>

      {scanMsg ? <Text style={styles.scanMsg}>{scanMsg}</Text> : null}
      {undoAction && (
        <Pressable
          onPress={async () => {
            const a = undoAction;
            const it = items.find((x) => x.id === a.itemId);
            if (it) await incBulto(it, -a.inc);
            setUndoAction(null);
          }}
          style={{ marginTop: 6, alignSelf: "flex-start" }}
        >
          <Text style={{ fontWeight: "800", textDecorationLine: "underline" }}>
            Deshacer
          </Text>
        </Pressable>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{
          paddingBottom: (isFinalizado ? 16 : 90) + insets.bottom,
        }}
        renderItem={({ item }) => {
          const rev = Number(item.bultos_revisados ?? 0);
          const esp = Number(item.bultos_esperados ?? 0);
          const ok = rev === esp;
          const sobra = rev > esp;
          const falta = rev < esp;
          const extra = esp === 0;

          return (
            <Pressable
              style={[
                styles.row,
                ok && styles.ok,
                falta && styles.warn,
                sobra && styles.bad,
                extra && styles.extra,
              ]}
              onPress={() => openStepper(item)}
              disabled={isFinalizado}
            >
              <Text style={styles.desc}>{item.descripcion}</Text>
              <Text style={styles.meta}>
                Código: {item.codigo} | Bultos: {rev}/{esp}
                {extra ? "  (EXTRA)" : ""}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados.</Text>}
      />

      {!isFinalizado && (
        <Pressable
          style={[
            styles.btn,
            loadingFin && styles.btnDisabled,
            { bottom: 12 + insets.bottom },
          ]}
          disabled={loadingFin}
          onPress={onFinalizar}
        >
          <Text style={styles.btnText}>
            {loadingFin ? "Guardando…" : "Finalizar"}
          </Text>
        </Pressable>
      )}

      {/* Modal stepper */}
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selected?.descripcion}</Text>
            <Text style={styles.modalSub}>
              Código: {selected?.codigo} — Esperado:{" "}
              {selected?.bultos_esperados}
            </Text>

            <View style={{ marginTop: 14, alignItems: "center" }}>
              <BultosStepper
                value={tempValue}
                onMinus={() => setTempValue((v) => Math.max(0, v - 1))}
                onPlus={() => setTempValue((v) => v + 1)}
              />
            </View>
            {modalMode === "lote" && (
              <View style={{ marginTop: 12 }}>
                <TextInput
                  value={String(tempValue ?? 0)}
                  onChangeText={(t) => {
                    const n = Number(String(t).replace(/\D/g, ""));
                    const v = Number.isFinite(n) ? Math.max(0, n) : 0;
                    setTempValue(v);
                    if (rememberLote) setLoteQty(v);
                  }}
                  placeholder="Cantidad…"
                  keyboardType="number-pad"
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: "#e6e6e6",
                    fontWeight: "800",
                    textAlign: "center",
                  }}
                />

                <Pressable
                  onPress={() => {
                    setRememberLote((v) => {
                      const next = !v;
                      if (next) setLoteQty(Math.max(1, Number(tempValue ?? 1)));
                      return next;
                    });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <Text style={{ fontWeight: "800" }}>
                    {rememberLote ? "☑" : "☐"} Recordar cantidad
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setOpen(false)}
              >
                <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={saveStepper}
              >
                <Text style={styles.modalBtnTextPrimary}>
                  {modalMode === "lote" ? "Añadir" : "Guardar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal elegir carpeta */}
      <Modal
        transparent
        visible={carpetaOpen}
        animationType="fade"
        onRequestClose={() => setCarpetaOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              ¿Dónde guardo las incidencias?
            </Text>
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

            <Pressable
              style={{
                marginTop: 10,
                backgroundColor: "#f9f5f5ff",
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#0c0b0bff",
              }}
              onPress={() => setCarpetaOpen(false)}
            >
              <Text style={styles.modalBtnTextGhost}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ✅ Modal cámara */}
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
  container: { flex: 1, padding: 16, backgroundColor: "#f4f4f4" },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  subtitle: { opacity: 0.7, marginBottom: 2 },
  done: { color: "#2e7d32", fontWeight: "800", marginBottom: 10 },

  searchWrap: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
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

  scanMsg: { marginBottom: 8, fontWeight: "800", opacity: 0.8 },

  row: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#eee",
  },
  ok: { borderColor: "#3fc146ff" },
  warn: { borderColor: "#e23030ff" },
  bad: { borderColor: "#3fc146ff" },
  extra: { borderStyle: "dashed" },

  desc: { fontWeight: "800" },
  meta: { opacity: 0.7, marginTop: 4 },
  empty: { textAlign: "center", marginTop: 30, opacity: 0.6 },

  btn: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "800" },

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
  modalBtn: {
    flex: 1,
    marginTop: 10,
    backgroundColor: "#161916ff",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4b4949ff",
  },
  modalBtnGhost: { backgroundColor: "#eee" },
  modalBtnPrimary: { backgroundColor: "#111" },
  modalBtnTextGhost: { fontWeight: "800" },
  modalBtnTextPrimary: { color: "#fff", fontWeight: "800" },

  folderBtn: {
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  folderBtnText: { color: "#fff", fontWeight: "900" },

  camWrap: { flex: 1, backgroundColor: "#000" },
  camHeader: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  camTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  clearBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e6e6e6",
  },
  stats: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    marginBottom: 10,
  },
  statsText: { fontWeight: "800", opacity: 0.8 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pill: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e6e6e6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillText: { fontWeight: "800", opacity: 0.8, fontSize: 12 },
  searchField: { flex: 1, position: "relative" },
  searchInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingRight: 38, // espacio para la X dentro
    borderWidth: 1,
    borderColor: "#e6e6e6",
  },
  searchClear: {
    position: "absolute",
    right: 10,
    top: "50%",
    marginTop: -10,
  },
});
