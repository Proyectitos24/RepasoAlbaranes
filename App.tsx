import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import InicioScreen from './src/screens/InicioScreen';
import ListaProductosScreen from './src/screens/ListaProductosScreen';
import { setupDb } from './src/database/setup';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    setupDb();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Inicio" component={InicioScreen} />
        <Stack.Screen name="ListaProductos" component={ListaProductosScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
