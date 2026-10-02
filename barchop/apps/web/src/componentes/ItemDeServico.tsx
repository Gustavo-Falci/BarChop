"use client";

import type { ServicoSerializado } from "@barchop/types";
import estilos from "./ItemDeServico.module.css";

// Um `input[type=checkbox]` de verdade, e não uma div com onClick: é o
// que dá teclado, leitor de tela e o papel "checkbox" pro teste.
export function ItemDeServico({
  servico,
  marcado,
  aoAlternar,
}: {
  servico: ServicoSerializado;
  marcado: boolean;
  aoAlternar: (id: string) => void;
}) {
  return (
    <label className={`${estilos.item} ${marcado ? estilos.marcado : ""}`}>
      <input
        type="checkbox"
        checked={marcado}
        onChange={() => aoAlternar(servico.id)}
      />
      <span>{servico.nome}</span>
      <span className={estilos.preco}>{formatarPreco(servico.preco)}</span>
    </label>
  );
}

// O preço vem como string decimal ("40.00") porque passar por float
// perderia centavo — ver ServicoSerializado. A conversão pra exibição
// acontece só aqui, na borda.
export function formatarPreco(preco: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(preco));
}
