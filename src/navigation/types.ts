export type RootStackParamList = {
  Menu: undefined;
  CargarCatalogo: undefined;
  ListaProductos: undefined;

  ImportarAlbaranes: undefined;
  ListaAlbaranes: undefined;
  RepasoAlbaran: { albaranId: number };

  FaltasYSobras: undefined;
  DetalleSaldo: { codigo: string; descripcion?: string };
};
