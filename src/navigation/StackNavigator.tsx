import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

import MenuScreen from '../screens/MenuScreen';
import CargarCatalogoScreen from '../screens/CargarCatalogoScreen';
import ListaProductosScreen from '../screens/ListaProductosScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function StackNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Menu">
        <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'Menú' }} />
        <Stack.Screen name="CargarCatalogo" component={CargarCatalogoScreen} options={{ title: 'Cargar catálogo' }} />
        <Stack.Screen name="ListaProductos" component={ListaProductosScreen} options={{ title: 'Consultar códigos' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
