export type RootStackParamList = {
  Menu: undefined;
  CargarCatalogo: undefined;
  ListaProductos: undefined;
  ImportarAlbaranes: undefined;
  ListaAlbaranes: undefined;
  RepasoAlbaran: { albaranId: number };
  FaltasYSobras: undefined;
  DetalleSaldo: { grupo: string; codigo: string; descripcion?: string };

  // ✅ NUEVOS
ManualFaltasHome: undefined;
ManualFaltasEditor: { grupo: string; grupoLabel: string };
};
