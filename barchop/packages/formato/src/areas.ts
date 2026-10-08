// As áreas das Configurações do painel (painel v2, marco 2), na ordem do
// índice. Uma área conta como "decidida" quando foi salva pelo menos uma
// vez, mesmo com o valor padrão — quem marca é a API, no salvar; a
// lista mora aqui pra API e o dublê do api-client usarem a mesma regra.
//
// O tipo `AreaDeConfiguracao` de @barchop/types repete estes nomes (o
// pacote de tipos não depende de nenhum outro); o teste deste arquivo
// fixa a lista.
export const AREAS_DE_CONFIGURACAO = [
  "horarios",
  // Painel v2, marco 3: como o cliente marca, remarca e cancela pelo link.
  "regras_de_agendamento",
  "dados_do_negocio",
  "comunicacao",
  "notificacoes",
] as const;

export type AreaDeConfiguracao = (typeof AREAS_DE_CONFIGURACAO)[number];

// Campo do PATCH /barbearias/me → a área que ele decide. Os horários e
// as imagens (capa e logo) têm rota própria e marcam a área deles direto;
// trocar só o formato da logo vem por aqui.
const AREA_DO_CAMPO: Record<string, AreaDeConfiguracao> = {
  nome: "dados_do_negocio",
  endereco: "dados_do_negocio",
  sobre: "dados_do_negocio",
  logoFormato: "dados_do_negocio",
  comodidades: "dados_do_negocio",
  formasDePagamento: "dados_do_negocio",
  telefone: "comunicacao",
  whatsapp: "comunicacao",
  instagram: "comunicacao",
  lembreteAtivo: "notificacoes",
  lembreteAntecedenciaHoras: "notificacoes",
  intervaloMinutos: "regras_de_agendamento",
  antecedenciaMinutos: "regras_de_agendamento",
  aceitaMesmoDia: "regras_de_agendamento",
  janelaDias: "regras_de_agendamento",
  cabeAntesDeFechar: "regras_de_agendamento",
  prazoRemarcarHoras: "regras_de_agendamento",
  prazoCancelarHoras: "regras_de_agendamento",
};

function naOrdem(areas: Iterable<string>): AreaDeConfiguracao[] {
  const conjunto = new Set(areas);
  return AREAS_DE_CONFIGURACAO.filter((area) => conjunto.has(area));
}

// As áreas que um corpo de PATCH decide — cada uma uma vez, na ordem do
// índice. Conta a PRESENÇA do campo, não o valor: mandar o mesmo valor
// de antes também é decidir.
// `object`, e não Record: o corpo tipado do PATCH (EdicaoDaBarbearia)
// não tem assinatura de índice, e só as chaves importam aqui.
export function areasTocadas(corpo: object): AreaDeConfiguracao[] {
  return naOrdem(
    Object.keys(corpo)
      .map((campo) => AREA_DO_CAMPO[campo])
      .filter((area): area is AreaDeConfiguracao => area !== undefined)
  );
}

// O que já estava decidido mais o que acabou de ser, sem repetir e na
// ordem do índice. Descarta o que não é área: um nome que saia da lista
// um dia não pode virar contagem fantasma.
export function juntarAreas(antes: readonly string[], novas: readonly string[]): AreaDeConfiguracao[] {
  return naOrdem([...antes, ...novas]);
}
