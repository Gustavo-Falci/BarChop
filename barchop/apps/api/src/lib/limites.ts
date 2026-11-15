import type { FastifyReply, FastifyRequest } from "fastify";
import { normalizarEmail, normalizarTelefone } from "@barchop/formato";
import { contarNaJanela } from "./contador-de-limite";
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
// um ataque distribuído faz. Mora no banco (ver `contadorDaConta`).
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
// gente atrás do mesmo endereço. Atrás do Caddy, o `request.ip` só é o
// do cliente com PROXIES_CONFIAVEIS (lib/borda.ts) — sem ela, todo mundo
// chegaria com o IP do proxy e este contador viraria um limite global,
// por isso a API não sobe em produção sem a variável.
const MAX_POR_IP = 100;
const JANELA_POR_IP = 5 * MINUTO;

// Criar barbearia é raro — uma vez por cliente da plataforma. O 409 do
// signup já não serve pra sondar e-mails: desde a Onda 1 (F3) ele só
// vem depois de um código que só chega a e-mail sem conta, e o pedido
// do código responde igual nos dois casos (routers/auth.ts).
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

// No formato { erro, mensagem } do resto da API: o 429 do plugin sairia
// como { message, error, statusCode }, que é o formato do framework, e
// nenhuma tela saberia ramificar nele.
function excedido(ttl: number): ErroHttp {
  return new ErroHttp(
    429,
    "tentativas_excedidas",
    // Maiúscula e ponto final, ao contrário das outras mensagens da API,
    // que são detalhe em minúscula: esta não é complemento de nada — as
    // duas telas de login põem `erro.mensagem` como o texto inteiro do
    // aviso, ao lado de "E-mail ou senha incorretos." e "Esse telefone
    // já tem senha. Use Entrar."
    `Muitas tentativas. Tente de novo em ${esperaEmPortugues(ttl)}.`
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

// O cliente se identifica por telefone ou, no piloto, por e-mail. Com
// e-mail no corpo, ele é a identidade — na definição de senha o
// telefone vai junto só pro cadastro novo — então é ele a chave.
function chaveDoCliente(corpo: unknown): string {
  const email = (corpo as { email?: unknown } | null)?.email;
  return typeof email === "string"
    ? `email:${chaveDoEmail(corpo)}`
    : `tel:${chaveDoTelefone(corpo)}`;
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
  // Requisição que este contador não conta (ex.: sem e-mail, no limite
  // por e-mail). Os outros contadores da rota continuam valendo.
  isenta?: (request: FastifyRequest) => boolean;
}

// Todos os contadores rodam como preHandler, que é depois da validação
// de schema: corpo torto leva 400 sem gastar orçamento de ninguém, e
// isso é de propósito — o que custa caro (o scrypt) está no handler,
// depois daqui, então o que precisa ser protegido está protegido.
//
// `createRateLimit`, e não `rateLimit()`: o handler do `rateLimit()`
// marca a requisição na primeira passagem e pula os outros da mesma
// rota — com ele, o segundo contador de cada lista (os por IP) nunca
// contava. Aqui cada contador confere a sua chave, e o primeiro que
// estourar responde.
function contador(app: App, limite: Limite) {
  const isenta = limite.isenta;
  const verificar = app.createRateLimit({
    max: limite.max,
    timeWindow: limite.janela,
    keyGenerator: limite.chave,
    ...(isenta ? { allowList: (request: FastifyRequest) => isenta(request) } : {}),
  });
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const resultado = await verificar(request);
    if (resultado.isAllowed || !resultado.isExceeded) return;
    // É o que diz à tela (e a qualquer cliente HTTP) quanto esperar.
    reply.header("retry-after", resultado.ttlInSeconds);
    throw excedido(resultado.ttl);
  };
}

// O contador por conta (ou por destino de mensagem): mora no banco
// (lib/contador-de-limite.ts), e não no LRU do plugin. Em memória, quem
// inundasse a rota com 5.000 chaves novas despejava a da conta bloqueada
// e ganhava as tentativas de volta; e um deploy zerava todas (auditoria
// de 15/11, SEC-002).
//
// Custa uma escrita no banco por tentativa. É pouco perto do scrypt que
// vem logo depois, e só chega aqui quem passou pelo contador por IP.
function contadorDaConta(limite: Limite) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (limite.isenta?.(request)) return;
    const { contagem, ttl } = await contarNaJanela(limite.chave(request), limite.janela);
    if (contagem <= limite.max) return;
    reply.header("retry-after", Math.ceil(ttl / 1000));
    throw excedido(ttl);
  };
}

// A ORDEM dentro de cada lista importa: o contador por IP vem primeiro.
// Com o por conta na frente, um IP já bloqueado continuava gastando o
// orçamento das contas a cada pedido recusado — de graça, fechava a
// conta dos outros e enchia o contador de chaves.
//
// Os prefixos de chave também importam: sem eles uma tentativa de login
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
      porIpNoLogin,
      contadorDaConta({
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) => `login-barbeiro:${chaveDoEmail(request.body)}`,
      }),
    ],

    // O login do suporte (bloco F4): os mesmos orçamentos do login do
    // painel, em chaves próprias.
    loginDoSuporte: [
      porIpNoLogin,
      contadorDaConta({
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) => `login-suporte:${chaveDoEmail(request.body)}`,
      }),
    ],

    signupDoBarbeiro: [
      contador(app, {
        max: MAX_SIGNUP_BARBEIRO,
        janela: JANELA_SIGNUP,
        chave: (request) => `signup-barbeiro:${request.ip}`,
      }),
    ],

    loginDoCliente: [
      porIpNoLogin,
      contadorDaConta({
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) =>
          `login-cliente:${slugDaRota(request)}:${chaveDoCliente(request.body)}`,
      }),
    ],

    codigoDoCliente: [
      contador(app, {
        max: MAX_CODIGO_POR_IP,
        janela: JANELA_SIGNUP,
        chave: (request) => `codigo-cliente-ip:${request.ip}`,
      }),
      contadorDaConta({
        max: MAX_CODIGO_POR_TELEFONE,
        janela: JANELA_CODIGO_POR_TELEFONE,
        chave: (request) =>
          `codigo-cliente:${slugDaRota(request)}:${chaveDoCliente(request.body)}`,
      }),
    ],

    // Os dois do esqueci-a-senha do barbeiro: mesmos números dos do
    // cliente, com o e-mail no lugar do telefone. O pedido manda e-mail
    // (custo e incômodo pra caixa de alguém); a confirmação é um login
    // por outro caminho.
    // O código do cadastro do dono (F3): mesmo orçamento do de redefinir
    // a senha, em chaves próprias — um não gasta o do outro.
    codigoDoCadastro: [
      contador(app, {
        max: MAX_CODIGO_POR_IP,
        janela: JANELA_SIGNUP,
        chave: (request) => `codigo-cadastro-ip:${request.ip}`,
      }),
      contadorDaConta({
        max: MAX_CODIGO_POR_TELEFONE,
        janela: JANELA_CODIGO_POR_TELEFONE,
        chave: (request) => `codigo-cadastro:${chaveDoEmail(request.body)}`,
      }),
    ],

    codigoDoBarbeiro: [
      contador(app, {
        max: MAX_CODIGO_POR_IP,
        janela: JANELA_SIGNUP,
        chave: (request) => `codigo-barbeiro-ip:${request.ip}`,
      }),
      contadorDaConta({
        max: MAX_CODIGO_POR_TELEFONE,
        janela: JANELA_CODIGO_POR_TELEFONE,
        chave: (request) => `codigo-barbeiro:${chaveDoEmail(request.body)}`,
      }),
    ],

    senhaDoBarbeiro: [
      porIpNoLogin,
      contadorDaConta({
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) => `senha-barbeiro:${chaveDoEmail(request.body)}`,
      }),
    ],

    // Aceitar o convite também é um login por outro caminho, e o código
    // dele vive 7 dias: sem teto por conta, quem chuta teria uma semana.
    conviteDoBarbeiro: [
      porIpNoLogin,
      contadorDaConta({
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) => `convite-barbeiro:${chaveDoEmail(request.body)}`,
      }),
    ],

    // Definir a senha confere um código: é um login por outro caminho, e
    // leva o mesmo orçamento por conta. O teto de tentativas do próprio
    // código segura quem chuta UM código; este segura quem chuta muitos,
    // pedindo códigos novos entre um e outro.
    senhaDoCliente: [
      porIpNoLogin,
      contadorDaConta({
        max: MAX_POR_CONTA,
        janela: JANELA_POR_CONTA,
        chave: (request) =>
          `senha-cliente:${slugDaRota(request)}:${chaveDoCliente(request.body)}`,
      }),
    ],
  };
}

export type LimitesDeAuth = ReturnType<typeof limitesDeAuth>;

// As rotas abertas fora do login (Onda 1, G2), antes de o Resend ir pra
// produção: a reputação do domínio é uma só, e a rota mais pesada não
// pode ficar de graça na página mais aberta do produto.

// O agendamento público manda e-mail pro endereço que a pessoa digitou,
// sem verificar (ADR-0009). Por caixa: 5 por hora cobre quem marca pra
// família inteira, e segura quem usa o BarChop pra encher a caixa de
// alguém. Por IP, folgado pelo NAT de operadora, como os de auth.
const MAX_AGENDAR_POR_EMAIL = 5;
const MAX_AGENDAR_POR_IP = 20;
const JANELA_AGENDAR = 60 * MINUTO;

// Os próximos horários: uma carga da página é uma chamada. 60 por minuto
// é alguém recarregando sem parar, não um cliente olhando a agenda.
const MAX_PROXIMOS_POR_IP = 60;

// A disponibilidade (auditoria de 15/11, SEC-004): as duas rotas mais
// caras da página pública estavam sem limite, e a API roda numa VM de
// 1 CPU. O dia custa uma consulta por profissional; trocar de dia na
// tela é uma chamada, e 120 por minuto é um salão inteiro atrás do
// mesmo Wi-Fi olhando a agenda. O mês repete a conta por dia do mês e a
// tela pede um por vez: 40 por minuto já é folga.
const MAX_DISPONIBILIDADE_POR_IP = 120;
const MAX_DISPONIBILIDADE_DO_MES_POR_IP = 40;

// O aviso de visita da home (home nova, marco 1): a home avisa uma vez
// por aba. 20 por minuto cobre um escritório inteiro atrás do mesmo NAT
// e segura quem tenta inflar a conta.
const MAX_VISITAS_POR_IP = 20;

// Convidar e reenviar mandam e-mail pra qualquer endereço que o dono
// digitar. 20 por dia montam uma equipe inteira com folga.
const MAX_CONVITES_POR_BARBEARIA = 20;
const JANELA_CONVITES = 24 * 60 * MINUTO;

function emailDoLembrete(corpo: unknown): string | null {
  const email = (corpo as { cliente?: { email?: unknown } } | null)?.cliente?.email;
  return typeof email === "string" ? normalizarEmail(email) : null;
}

export function limitesPublicos(app: App) {
  return {
    // O IP primeiro, como nos de auth (ver `limitesDeAuth`).
    agendar: [
      contador(app, {
        max: MAX_AGENDAR_POR_IP,
        janela: JANELA_AGENDAR,
        chave: (request) => `agendar-ip:${request.ip}`,
      }),
      contadorDaConta({
        max: MAX_AGENDAR_POR_EMAIL,
        janela: JANELA_AGENDAR,
        chave: (request) => `agendar-email:${emailDoLembrete(request.body)}`,
        isenta: (request) => !emailDoLembrete(request.body),
      }),
    ],
    proximosHorarios: [
      contador(app, {
        max: MAX_PROXIMOS_POR_IP,
        janela: MINUTO,
        chave: (request) => `proximos-ip:${request.ip}`,
      }),
    ],
    disponibilidade: [
      contador(app, {
        max: MAX_DISPONIBILIDADE_POR_IP,
        janela: MINUTO,
        chave: (request) => `disponibilidade-ip:${request.ip}`,
      }),
    ],
    disponibilidadeDoMes: [
      contador(app, {
        max: MAX_DISPONIBILIDADE_DO_MES_POR_IP,
        janela: MINUTO,
        chave: (request) => `disponibilidade-mes-ip:${request.ip}`,
      }),
    ],
    visita: [
      contador(app, {
        max: MAX_VISITAS_POR_IP,
        janela: MINUTO,
        chave: (request) => `visita-ip:${request.ip}`,
      }),
    ],
  };
}

export type LimitesPublicos = ReturnType<typeof limitesPublicos>;

// No escopo protegido: roda depois do `autenticar`, então a barbearia do
// token já está na requisição.
export function limitesDaEquipe(app: App) {
  return {
    convite: [
      contador(app, {
        max: MAX_CONVITES_POR_BARBEARIA,
        janela: JANELA_CONVITES,
        chave: (request) => `convite:${request.user.barbeariaId}`,
      }),
    ],
  };
}

export type LimitesDaEquipe = ReturnType<typeof limitesDaEquipe>;
