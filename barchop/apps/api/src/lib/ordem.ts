import { ErroHttp } from "./erro-http";
import { PADRAO_UUID } from "./padroes";

// A ordem que o dono arrastou (arrastar e reordenar, PR 2; colunas da
// migration 20261021120000_ordem). Serve aos serviços e à equipe.
//
// A lista vai inteira numa chamada, não "mova X pra posição N": o mesmo
// pedido repetido dá o mesmo resultado, e dois cliques não brigam.

export const corpoDaOrdem = {
  type: "object",
  additionalProperties: false,
  required: ["ids"],
  properties: {
    // O teto só barra corpo absurdo; nenhuma barbearia chega perto.
    ids: { type: "array", minItems: 1, maxItems: 500, items: { type: "string", pattern: PADRAO_UUID } },
  },
} as const;

// A lista tem que ser exatamente o conjunto da barbearia: faltando um,
// ele ficaria com a ordem velha no meio da nova; sobrando, seria id de
// outra barbearia (ou apagado). 400, e não 404: o erro é a lista.
export function garantirMesmoConjunto(enviados: readonly string[], daBarbearia: readonly string[], oQue: string): void {
  const conjunto = new Set(enviados);
  const iguais =
    conjunto.size === enviados.length &&
    enviados.length === daBarbearia.length &&
    daBarbearia.every((id) => conjunto.has(id));
  if (!iguais) {
    throw new ErroHttp(400, "requisicao_invalida", `a lista precisa ter ${oQue} da barbearia, cada um uma vez`);
  }
}

// De 10 em 10, como o preenchimento da migração e o trigger de quem nasce.
export function ordemNaPosicao(indice: number): number {
  return (indice + 1) * 10;
}
