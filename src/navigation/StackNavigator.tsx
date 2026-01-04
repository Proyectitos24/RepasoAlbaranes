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


const Stack = createNativeStackNavigator<RootStackParamList>();

export default function StackNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Menu">
        <Stack.Screen name="Menu" component={MenuScreen} options={{ title: "Inicio" }} />

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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
