// App.tsx
import React, { useEffect } from 'react';
import StackNavigator from './src/navigation/StackNavigator';
import { initDb } from './src/database/setup';

export default function App() {
  useEffect(() => {
    initDb().catch((e) => console.log('❌ initDb:', e));
  }, []);

  return <StackNavigator />;
}
