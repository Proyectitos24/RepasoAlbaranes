import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";

import CargarCatalogoScreen from "../screens/CargarCatalogoScreen";
import MenuScreen from "../screens/MenuScreen";
import ListaProductosScreen from "../screens/ListaProductosScreen";
import ImportarAlbaranesScreen from "../screens/ImportarAlbaranesScreen";
import ListaAlbaranesScreen from "../screens/ListaAlbaranesScreen";
import RepasoAlbaranScreen from "../screens/RepasoAlbaranScreen";
import FaltasYSobrasScreen from "../screens/FaltasYSobrasScreen";
import DetalleSaldoScreen from "../screens/DetalleSaldoScreen";

// ✅ NUEVAS PANTALLAS
import ManualFaltasHomeScreen from "../screens/ManualFaltasHomeScreen";
import ManualFaltasEditorScreen from "../screens/ManualFaltasEditorScreen";
import GestionarSaldoGrupoScreen from "../screens/GestionarSaldoGrupoScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function StackNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Menu">
        <Stack.Screen
          name="Menu"
          component={MenuScreen}
          options={{ title: "Inicio" }}
        />

        <Stack.Screen
          name="CargarCatalogo"
          component={CargarCatalogoScreen}
          options={{ title: "Catálogo" }}
        />

        <Stack.Screen
          name="ListaProductos"
          component={ListaProductosScreen}
          options={{ title: "Consultar códigos" }}
        />

        <Stack.Screen
          name="ImportarAlbaranes"
          component={ImportarAlbaranesScreen}
          options={{ title: "Añadir albaranes" }}
        />

        <Stack.Screen
          name="ListaAlbaranes"
          component={ListaAlbaranesScreen}
          options={{ title: "Repasar albaranes" }}
        />

        <Stack.Screen
          name="RepasoAlbaran"
          component={RepasoAlbaranScreen}
          options={{ title: "Repaso" }}
        />

        <Stack.Screen
          name="FaltasYSobras"
          component={FaltasYSobrasScreen}
          options={{ title: "Faltas y sobras" }}
        />

        <Stack.Screen
          name="DetalleSaldo"
          component={DetalleSaldoScreen}
          options={{ title: "Detalle" }}
        />

        {/* ✅ NUEVO FLUJO MANUAL */}
        <Stack.Screen
          name="ManualFaltasHome"
          component={ManualFaltasHomeScreen}
          options={{ title: "Manual: carpetas" }}
        />

        <Stack.Screen
          name="ManualFaltasEditor"
          component={ManualFaltasEditorScreen}
          options={{ title: "Manual: añadir" }}
        />

        <Stack.Screen
          name="GestionarSaldoGrupo"
          component={GestionarSaldoGrupoScreen}
          options={{ title: "Gestionar carpeta" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
