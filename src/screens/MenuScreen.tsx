import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getDb } from "../database/db";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function MenuScreen({ navigation }: any) {
  const [count, setCount] = useState(0);

  const cargarEstado = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{ c: number }>(
        "SELECT COUNT(*) as c FROM productos;"
      );
      setCount(rows?.[0]?.c ?? 0);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  useFocusEffect(
    useCallback(() => {
      cargarEstado();
    }, [cargarEstado])
  );

  const hayCatalogo = count > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RepasoAlbaranes</Text>
      <Text style={styles.sub}>
        Catálogo:{" "}
        {hayCatalogo ? `CARGADO (${count.toLocaleString()})` : "NO CARGADO"}
      </Text>

      <Pressable
        style={styles.btn}
        onPress={() => navigation.navigate("CargarCatalogo")}
      >
        <View style={styles.btnRow}>
          <MaterialCommunityIcons name="database-plus-outline" size={20} color="#fff" />
          <Text style={styles.btnText}>Cargar / Actualizar catálogo</Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.btn, !hayCatalogo && styles.btnDisabled]}
        disabled={!hayCatalogo}
        onPress={() => navigation.navigate("ListaProductos")}
      >
        <View style={styles.btnRow}>
          <MaterialCommunityIcons name="barcode-scan" size={20} color="#fff" />
          <Text style={styles.btnText}>Consultar códigos</Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.btn}
        onPress={() => navigation.navigate("ImportarAlbaranes")}
      >
        <View style={styles.btnRow}>
          <MaterialCommunityIcons name="file-import-outline" size={20} color="#fff" />
          <Text style={styles.btnText}>Añadir albaranes</Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.btn}
        onPress={() => navigation.navigate("ListaAlbaranes")}
      >
        <View style={styles.btnRow}>
          <MaterialCommunityIcons name="playlist-check" size={20} color="#fff" />
          <Text style={styles.btnText}>Repasar albaranes</Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.btn}
        onPress={() => navigation.navigate("FaltasYSobras")}
      >
        <View style={styles.btnRow}>
          <MaterialCommunityIcons name="clipboard-list-outline" size={20} color="#fff" />
          <Text style={styles.btnText}>Faltas y sobras</Text>
        </View>
      </Pressable>

      {/* ✅ NUEVO BOTÓN */}
      <Pressable
        style={[styles.btn, !hayCatalogo && styles.btnDisabled]}
        disabled={!hayCatalogo}
        onPress={() => navigation.navigate("ManualFaltasHome")}
      >
        <View style={styles.btnRow}>
          <MaterialCommunityIcons name="folder-plus-outline" size={20} color="#fff" />
          <Text style={styles.btnText}>Falta y sobra manual</Text>
        </View>
      </Pressable>

      {!hayCatalogo && (
        <Text style={styles.hint}>
          Primero carga el catálogo para poder consultar y usar el modo manual.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#fff",
  },
  title: { fontSize: 34, fontWeight: "800", textAlign: "center" },
  sub: { textAlign: "center", opacity: 0.7, marginBottom: 12 },

  btn: {
    backgroundColor: "#1f6feb",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.4 },

  btnRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  btnText: { color: "white", fontWeight: "800" },

  hint: { marginTop: 6, textAlign: "center", opacity: 0.6 },
});
