import type { AreaDeConfiguracao, BarbeariaDoPainel, HorarioSerializado } from "@barchop/types";

// As áreas das Configurações como o painel as mostra (painel v2, marco
// 2). A ordem é a do índice e a mesma de AREAS_DE_CONFIGURACAO em
// @barchop/formato — é ela que decide qual é a "próxima área faltando".
// O que conta como decidida vem da API (`areasDecididas`): salva pelo
// menos uma vez, mesmo com o valor padrão.
export interface DescricaoDaArea {
  area: AreaDeConfiguracao;
  titulo: string;
  // Uma frase sob o título da subtela.
  apoio: string;
  rota: string;
  // O que acontece se a área ficar como está — o texto em âmbar do
  // índice, enquanto ninguém salvou.
  consequencia: string;
}

export const AREAS: DescricaoDaArea[] = [
  {
    area: "horarios",
    titulo: "Horários",
    apoio: "Quando a barbearia atende, dia a dia.",
    rota: "/painel/configuracoes/horarios",
    consequencia: "Sem horário salvo, a página não mostra horário livre pra ninguém marcar",
  },
  {
    area: "dados_do_negocio",
    titulo: "Dados do negócio",
    apoio: "Como a barbearia se apresenta na página pública.",
    rota: "/painel/configuracoes/dados-do-negocio",
    consequencia: "Nome, endereço e apresentação da página ainda não conferidos",
  },
  {
    area: "comunicacao",
    titulo: "Comunicação",
    apoio: "Como o cliente fala com você fora do app.",
    rota: "/painel/configuracoes/comunicacao",
    consequencia: "Sem WhatsApp, o cliente não tem como falar com você pela página",
  },
  {
    area: "notificacoes",
    titulo: "Notificações",
    apoio: "O lembrete que o cliente recebe antes do horário.",
    rota: "/painel/configuracoes/notificacoes",
    consequencia: "O lembrete segue no padrão que veio, sem ninguém ter conferido",
  },
];

export function descricaoDaArea(area: AreaDeConfiguracao): DescricaoDaArea {
  return AREAS.find((descricao) => descricao.area === area)!;
}

// A primeira área ainda não decidida, fora a que está aberta. Sem
// nenhuma, o rodapé da subtela some.
export function proximaFaltando(
  decididas: readonly AreaDeConfiguracao[],
  atual?: AreaDeConfiguracao
): DescricaoDaArea | undefined {
  return AREAS.find((descricao) => descricao.area !== atual && !decididas.includes(descricao.area));
}

function plural(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

// O que vale hoje, numa linha — o texto do índice quando a área já foi
// decidida.
export function resumoDaArea(
  area: AreaDeConfiguracao,
  barbearia: BarbeariaDoPainel,
  horarios: HorarioSerializado[]
): string {
  switch (area) {
    case "horarios": {
      const abertos = horarios.filter((dia) => !dia.fechado).length;
      return abertos === 0 ? "Fechado todos os dias" : `Aberto ${plural(abertos, "dia", "dias")} por semana`;
    }
    case "dados_do_negocio":
      return `${barbearia.nome} · ${barbearia.endereco ?? "sem endereço"}`;
    case "comunicacao": {
      const canais = [barbearia.telefone, barbearia.whatsapp, barbearia.instagram].filter(Boolean).length;
      return canais === 0 ? "Nenhum canal de contato" : plural(canais, "canal de contato", "canais de contato");
    }
    case "notificacoes":
      return barbearia.lembreteAtivo
        ? `Lembrete por e-mail ${barbearia.lembreteAntecedenciaHoras} horas antes`
        : "Lembrete por e-mail desligado";
  }
}
