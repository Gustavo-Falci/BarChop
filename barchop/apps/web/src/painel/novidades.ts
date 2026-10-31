// O que mudou no BarChop, da mais nova pra mais antiga, pro menu "…" da
// barra de topo. Lista fixa no código: entra junto do PR que entrega a
// novidade, e sai do ar junto com ele se for revertido.
export interface Novidade {
  // AAAA-MM-DD: compara como texto, sem fuso no meio.
  data: string;
  titulo: string;
  texto: string;
}

export const NOVIDADES: Novidade[] = [
  {
    data: "2026-10-31",
    titulo: "Planos pagos pela Stripe",
    texto:
      "Quem vende planos agora pode receber pela Stripe, além do Asaas: em Pagamentos online, escolha a Stripe e cole uma chave restrita, com o passo a passo na tela. O cliente paga no cartão, na página da Stripe, sem o CPF, e a mensalidade entra no Caixa como as do Asaas. Os termos de uso e a política de privacidade falam da Stripe também.",
  },
  {
    data: "2026-10-25",
    titulo: "Termos e privacidade com os planos",
    texto:
      "Os termos de uso e a política de privacidade agora falam dos planos que a barbearia vende: o dinheiro vai direto pra conta de quem vende no Asaas, sem taxa do BarChop, e o CPF de quem assina online vai pra essa conta pra criar a cobrança.",
  },
  {
    data: "2026-10-25",
    titulo: "Planos de assinatura",
    texto:
      "Crie planos da casa ou de cada profissional, com os serviços incluídos e quantas vezes cada um vale no ciclo. O cliente assina pela sua página e paga na fatura do Asaas, direto na conta de quem vende, ou combina no balcão. No atendimento, Usar o plano conta o uso, e a mensalidade entra no acerto do Caixa. No plano Completo.",
  },
  {
    data: "2026-10-17",
    titulo: "Visual novo: menos amarelo, mais respiro",
    texto:
      "Cores mais calmas pra olhar o dia inteiro, contornos finos no lugar das molduras e um Salvar só por tela, que diz o que mudou. No celular, a navegação desceu pro pé da tela, com o Novo agendamento no centro. A Agenda escreve só as horas cheias, e a Aparência e o Membro da equipe ganharam abas.",
  },
  {
    data: "2026-10-16",
    titulo: "Caixa do dia",
    texto:
      "Ao concluir um atendimento, registre o pagamento: forma, desconto, gorjeta e quem recebeu. No Caixa, veja quanto entrou, quem repassa quanto a quem e feche o dia. A divisão entre a equipe e a casa fica em Configurações. Nos planos Essencial e Completo.",
  },
  {
    data: "2026-10-15",
    titulo: "Faturas e assinatura",
    texto:
      "Em Faturas, no menu da sua conta: escolha o Essencial ou o Completo, quantos profissionais e mensal ou anual, pague com cartão e o acesso é liberado na hora. Assinando no teste, a 1ª cobrança é só no fim dele. Depois, as faturas ficam lá, com o PDF de cada uma.",
  },
  {
    data: "2026-10-13",
    titulo: "Sino de notificações",
    texto:
      "O sino no canto de cima avisa quando um cliente marca, cancela, remarca ou confirma presença pelo link, e traz os avisos do BarChop.",
  },
  {
    data: "2026-10-13",
    titulo: "Menu de conta e de opções no topo",
    texto:
      "Tema (Claro, Escuro ou Sistema), Central de ajuda, novidades e Sair agora ficam no canto de cima do painel.",
  },
  {
    data: "2026-10-13",
    titulo: "Prévia da página numa moldura só",
    texto:
      "Na Aparência, veja sua página no celular ou no computador, com o modo escuro num interruptor e a medida certa da logo e da capa.",
  },
  {
    data: "2026-10-11",
    titulo: "Aparência da sua página",
    texto:
      "Escolha tema, cores, fontes, cantos e o jeito de mostrar os serviços. Você mexe num rascunho e só publica quando gostar.",
  },
  {
    data: "2026-10-11",
    titulo: "Semana da agenda por profissional",
    texto:
      "A vista de semana filtra por profissional, sombreia pausa e fora do expediente, e mostra a hora nos horários livres.",
  },
  {
    data: "2026-10-09",
    titulo: "Serviços por categoria",
    texto:
      "Cada serviço ganha uma categoria (cabelo, barba, combo…) e a página mostra as seções nessa ordem. O cadastro mostra como o cliente vê.",
  },
  {
    data: "2026-10-08",
    titulo: "Logo da barbearia com moldura",
    texto:
      "Envie a logo e escolha a moldura: redonda, quadrada ou livre. Ela aparece na sua página e na barra do painel.",
  },
  {
    data: "2026-10-08",
    titulo: "Bloquear horário direto da agenda",
    texto:
      "Na agenda, o botão Bloquear tira um horário ou um dia inteiro sem sair da tela.",
  },
];

export const CHAVE_DAS_NOVIDADES = "painel.novidades.vistas";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Quantas saíram depois da última vez que o menu de novidades foi
// aberto. Quem nunca abriu (ou tem lixo gravado) vê todas como novas.
export function contarNovas(novidades: Novidade[], vistaEm: string | null): number {
  if (!vistaEm || !DATA.test(vistaEm)) return novidades.length;
  return novidades.filter((novidade) => novidade.data > vistaEm).length;
}

export function lerNovidadesVistas(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_DAS_NOVIDADES);
  } catch {
    return null;
  }
}

export function marcarNovidadesVistas(): void {
  const maisNova = NOVIDADES[0];
  if (!maisNova) return;
  try {
    window.localStorage.setItem(CHAVE_DAS_NOVIDADES, maisNova.data);
  } catch {
    // Sem localStorage (aba anônima travada): o selo volta na próxima
    // visita, e é só isso que se perde.
  }
}
