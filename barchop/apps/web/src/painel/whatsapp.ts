import { apenasDigitos } from "@barchop/formato";

// Zap abre no aplicativo com a conversa pronta. O 55 entra aqui porque o
// telefone guardado é nacional — "(15) 99782-7833" vira 5515997827833.
// Na lista de clientes (ação da linha) e no detalhe do cliente (topo).
export function linkDoZap(telefone: string): string {
  return `https://wa.me/55${apenasDigitos(telefone)}`;
}
