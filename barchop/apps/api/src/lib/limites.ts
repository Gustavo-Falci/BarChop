import type { FastifyRequest } from "fastify";
import { normalizarEmail, normalizarTelefone } from "@barchop/formato";
import { ErroHttp } from "./erro-http";
import type { App } from "../tipos";

// Os limites das rotas que recebem senha. Sem eles, adivinhar senha é
// de graça: as rotas respondem igual pra conta inexistente e pra senha
// errada, e essa uniformidade — que existe pra não vazar quais contas
// existem — também significa que nada se cansa de responder.
//
// Tem um segundo motivo, menos óbvio: todo login roda um scrypt, de
// propósito lento, inclusive o de e-mail que não existe (ver
// `obterHashDescartavel` em senha.ts). Sem limite, qualquer um queima
// CPU da API sem precisar de conta nenhuma.

const MINUTO = 60 * 1000;

// Contador por conta. É o que importa: o alvo de quem adivinha senha é
// UM cadastro. A chave não leva o IP de propósito — com o IP dentro
// dela, trocar de saída renovaria o orçamento, que é exatamente o que
// um ataque distribuído faz.
//
// 10 em 10 minutos: quem erra a senha duas ou três vezes não percebe o
// limite, e quem adivinha fica em uma tentativa por minuto. Não é
// bloqueio de conta — passada a janela, a conta volta sozinha. Bloquear
// de verdade daria a qualquer um uma forma de trancar o barbeiro certo
// do lado de fora, e pior ainda enquanto não existe recuperação de
// senha (dívida registrada no roadmap).
const MAX_POR_CONTA = 10;
const JANELA_POR_CONTA = 10 * MINUTO;

// Contador por IP: rede de arrasto pra quem varre muitas contas de uma
// origem só. Folgado de propósito, porque NAT de operadora põe muita
// gente atrás do mesmo endereço — e porque, atrás de proxy reverso sem
// `trustProxy` configurado, TODO mundo chega com o IP do proxy e este
// contador viraria um limite global. Ver a nota no roadmap.
const MAX_POR_IP = 100;
const JANELA_POR_IP = 5 * MINUTO;

// Criar barbearia é raro — uma vez por cliente da plataforma. Este
// limite é também o que estreita a sondagem de e-mails que o 409 do
// signup permite (dívida conhecida): sondar em série deixou de ser
// grátis, mesmo que o 409 continue respondendo.
const MAX_SIGNUP_BARBEIRO = 5;

const JANELA_SIGNUP = 60 * MINUTO;

// Pedir código de verificação manda uma mensagem — paga no provedor, e
// um incômodo no celular de alguém. Por telefone é apertado: três
// pedidos cobrem "não chegou, manda de novo" duas vezes, e um quarto em
// 15 minutos já não é a pessoa esperando o código. Por IP fica folgado,
// pelo mesmo motivo de NAT dos outros contadores.
const MAX_CODIGO_POR_TELEFONE = 3;
const JANELA_CODIGO_POR_TELEFONE = 15 * MINUTO;
const MAX_CODIGO_POR_IP = 20;

// A mensagem do plugin é inglesa ("retry in 1 minute") e viraria texto
// de tela. Em segundos enquanto couber, porque "em 2 minutos" pra 31
// segundos faz esperar o dobro à toa.
function esperaEmPortugues(ttl: number): string {
  const segundos = Math.ceil(ttl / 1000);
  if (segundos <= 90) {
    return `${segundos} segundo${segundos === 1 ? "" : "s"}`;
  }
  const minutos = Math.ceil(segundos / 60);
  return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
}

// O plugin LANÇA o que esta função devolve (ver o `throw
// params.errorResponseBuilder(...)` no index.js dele), então devolver um
// ErroHttp é o que mantém a resposta no formato { erro, mensagem } do
// resto da API — sem isto a 429 sairia como { message, error, statusCode
// }, que é o formato do framework, e nenhuma tela saberia ramificar
// nela. O cabeçalho Retry-After o plugin já pôs antes de lançar.
function excedido(_request: FastifyRequest, contexto: { ttl: number }): ErroHttp {
  return new ErroHttp(
    429,
    "tentativas_excedidas",
    // Maiúscula e ponto final, ao contrário das outras mensagens da API,
    // que são detalhe em minúscula: esta não é complemento de nada — as
    // duas telas de login põem `erro.mensagem` como o texto inteiro do
    // aviso, ao lado de "E-mail ou senha incorretos." e "Esse telefone
    // já tem senha. Use Entrar."
    `Muitas tentativas. Tente de novo em ${esperaEmPortugues(contexto.ttl)}.`
  );
}

// A chave tem que ser o valor NORMALIZADO, não o que veio no corpo: o
// login já busca pelo e-mail normalizado, então "Gu@Exemplo.com" e
// "gu@exemplo.com" são a mesma conta. Se a chave usasse o texto cru,
// alternar a caixa renovaria o orçamento e o limite não limitaria nada.
function chaveDoEmail(corpo: unknown): string {
  const email = (corpo as { email?: unknown } | null)?.email;
  if (typeof email !== "string") return "sem-email";
  return normalizarEmail(email) ?? "sem-email";
}

// Mesmo raciocínio do e-mail, e o mesmo da gravação: desde
// `lib/telefone.ts` o número mora num formato só, então (11) 99999-8888
// e 11999998888 têm que cair na mesma chave.
function chaveDoTelefone(corpo: unknown): string {
  const telefone = (corpo as { telefone?: unknown } | null)?.telefone;
  if (typeof telefone !== "string") return "sem-telefone";
  try {
    return normalizarTelefone(telefone) ?? "sem-telefone";
  } catch {
    // Formato que o pattern do schema aceitou e o normalizador recusa.
    // Uma chave só pra todos eles, senão variar a pontuação inválida
    // seria um jeito de nunca gastar orçamento.
    return "telefone-invalido";
  }
}

// O login do cliente é por barbearia: o mesmo telefone em duas
// barbearias são duas contas, e uma não pode gastar o limite da outra.
function slugDaRota(request: FastifyRequest): string {
  const slug = (request.params as { slug?: unknown } | null)?.slug;
  return typeof slug === "string" ? slug : "sem-slug";
}

interface Limite {
  max: number;
  janela: number;
  chave: (request: FastifyRequest) => string;
}

// Todos os contadores rodam como preHandler, que é depois da validação
// de schema: corpo torto leva 400 sem gastar orçamento de ninguém, e
// isso é de propósito — o que custa caro (o scrypt) está no handler,
// depois daqui, então o que precisa ser protegido está protegido.
function contador(app: App, limite: Limite) {
  return app.rateLimit({
    max: limite.max,
    timeWindow: limite.janela,
    keyGenerator: limite.chave,
    errorResponseBuilder: excedido,
  });
}

// Os prefixos de chave importam: sem eles uma tentativa de login
// gastaria o orçamento do signup do mesmo IP, e um limite explicaria o
// bloqueio do outro.
export function limitesDeAuth(app: App) {
  const porIpNoLogin = contador(app, {
    max: MAX_POR_IP,
    janela: JANELA_POR_IP,
    chave: (request) => `login-ip:${request.ip}`,
  });

  return {
    loginDoBarbeiro: [
      contador(app, {
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) => `login-barbeiro:${chaveDoEmail(request.body)}`,
      }),
      porIpNoLogin,
    ],

    signupDoBarbeiro: [
      contador(app, {
        max: MAX_SIGNUP_BARBEIRO,
        janela: JANELA_SIGNUP,
        chave: (request) => `signup-barbeiro:${request.ip}`,
      }),
    ],

    loginDoCliente: [
      contador(app, {
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) =>
          `login-cliente:${slugDaRota(request)}:${chaveDoTelefone(request.body)}`,
      }),
      porIpNoLogin,
    ],

    codigoDoCliente: [
      contador(app, {
        max: MAX_CODIGO_POR_TELEFONE,
        janela: JANELA_CODIGO_POR_TELEFONE,
        chave: (request) =>
          `codigo-cliente:${slugDaRota(request)}:${chaveDoTelefone(request.body)}`,
      }),
      contador(app, {
        max: MAX_CODIGO_POR_IP,
        janela: JANELA_SIGNUP,
        chave: (request) => `codigo-cliente-ip:${request.ip}`,
      }),
    ],

    // Definir a senha confere um código: é um login por outro caminho, e
    // leva o mesmo orçamento por conta. O teto de tentativas do próprio
    // código segura quem chuta UM código; este segura quem chuta muitos,
    // pedindo códigos novos entre um e outro.
    senhaDoCliente: [
      contador(app, {
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) =>
          `senha-cliente:${slugDaRota(request)}:${chaveDoTelefone(request.body)}`,
      }),
      porIpNoLogin,
    ],
  };
}

export type LimitesDeAuth = ReturnType<typeof limitesDeAuth>;
