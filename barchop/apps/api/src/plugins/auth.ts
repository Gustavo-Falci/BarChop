import fastifyJwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, type PapelMembro } from "@barchop/database";
import { ErroHttp } from "../lib/erro-http";
import { segredoDoServidor } from "../lib/segredos";
import { apagarSessao, tokenDoPedido, type TipoDeSessao, type TokenDoPedido } from "../lib/sessao-por-cookie";
import type { App } from "../tipos";

// As duas identidades da plataforma. O `tipo` é o que separa uma da
// outra dentro de um token: sem ele, um token de cliente e um de
// barbeiro só se distinguiriam pelos campos presentes, e um payload
// forjado com os dois passaria pelos dois hooks.
export interface PayloadBarbeiro {
  tipo: "barbeiro";
  barbeiroId: string;
  barbeariaId: string;
  // Posto pelo próprio jwt ao assinar (segundos). Opcional porque quem
  // assina não passa; é o hook que lê, contra a última troca de senha.
  iat?: number;
}

export interface PayloadCliente {
  tipo: "cliente";
  clienteId: string;
  barbeariaId: string;
  iat?: number;
}

// Não é identidade: é o link do e-mail de lembrete, que deixa confirmar
// ou cancelar UM agendamento sem login (routers/lembretes.ts). O `tipo`
// é o que impede esse token de abrir o painel ou a conta do cliente —
// os dois hooks abaixo exigem o deles. `exp` é o início do horário.
export interface PayloadLembrete {
  tipo: "lembrete";
  agendamentoId: string;
  exp: number;
}

// Também não é identidade: a prova de que quem cria a conta é quem
// acabou de marcar UM agendamento pela página (06/11). Volta só na
// resposta da criação, e a tela guarda na aba (sessionStorage), nunca
// em link: diferente do link do horário, que vai pro WhatsApp e pra
// agenda, este não é feito pra ser repassado. Os hooks abaixo não o
// aceitam (exigem o tipo deles), e o lerToken do lembrete também não.
export interface PayloadContaDoAgendamento {
  tipo: "conta_do_agendamento";
  agendamentoId: string;
  exp: number;
}

// O suporte da plataforma (bloco F4). Não é membro de barbearia: sem
// `barbeariaId`, e por isso nunca pode passar no `autenticar` do painel —
// lá `where: { barbeariaId: undefined }` viraria "todas". O hook do
// painel aceita só `tipo === "barbeiro"`; este, só `"suporte"`.
export interface PayloadSuporte {
  tipo: "suporte";
  operadorId: string;
  iat?: number;
}

// Quem está usando o painel, com o papel lido do banco nesta requisição.
export interface Membro {
  id: string;
  barbeariaId: string;
  papel: PapelMembro;
  // O dono liberou pra vender planos ao cliente (Onda 2, marco 3).
  podeVenderPlanos: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    // Preenchido só pelo autenticarCliente. Opcional porque o tipo vale
    // pra toda requisição da aplicação, inclusive as do barbeiro.
    cliente?: PayloadCliente;
    // Preenchido só pelo autenticar, pelo mesmo motivo.
    membro?: Membro;
    // Preenchido só pelo autenticarSuporte.
    operador?: PayloadSuporte;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    // O que se assina pode ser qualquer uma das duas, ou o link do
    // lembrete, ou a prova do "Criar conta" da tela de sucesso...
    payload:
      | PayloadBarbeiro
      | PayloadCliente
      | PayloadLembrete
      | PayloadSuporte
      | PayloadContaDoAgendamento;
    // ...mas `request.user` é lido só dentro do escopo protegido do
    // barbeiro, onde o hook abaixo já garantiu qual é. Declarar a união
    // aqui obrigaria narrowing em seis arquivos de rota que hoje leem
    // `request.user.barbeariaId` direto, sem ganhar segurança nenhuma:
    // quem garante não é o tipo, é o hook.
    user: PayloadBarbeiro;
  }
}

export function registrarAuth(app: App): void {
  // Ausente ou curto, lança aqui e a API não sobe (lib/segredos.ts).
  const segredo = segredoDoServidor();

  // Sem `expiresIn` padrão, de propósito: desde o fast-jwt 6 ele
  // SOBRESCREVE o `exp` que vem no payload, e o link do lembrete e a
  // prova do "Criar conta" passariam a valer 7 dias em vez de até o
  // horário e de 1 hora. O prazo da sessão mora no `assinarSessao`.
  //
  // `requiredClaims` fecha o outro lado: token sem `exp` não passa em
  // nenhuma verificação. Quem assinar uma sessão por fora do
  // `assinarSessao` ganha um 401 no primeiro teste, não um token eterno.
  app.register(fastifyJwt, { secret: segredo, verify: { requiredClaims: ["exp"] } });
}

// Token com prazo. Com o hook lendo o banco a revogação já é imediata;
// a expiração é defesa em profundidade contra token roubado. Decidir
// cedo evitou retrofitar tratamento de 401 e novo login nas telas.
const VALIDADE_DA_SESSAO = "7d";

// A do Suporte é curta: a conta confirma pagamentos, troca links e fala
// com todos os donos, e o token mora no navegador. Sete dias era tempo
// demais pra um token roubado valer (auditoria de 15/11, SEC-008). Duas
// horas cobrem uma rodada de conferência; depois, entra de novo.
const VALIDADE_DA_SESSAO_DO_SUPORTE = "2h";

// O único jeito de assinar uma identidade (painel, cliente, suporte).
// Os tokens que não são identidade levam o próprio `exp` no payload
// (lib/lembrete.ts, lib/conta-do-agendamento.ts).
export function assinarSessao(
  app: Pick<App, "jwt">,
  payload: PayloadBarbeiro | PayloadCliente | PayloadSuporte
): string {
  const validade = payload.tipo === "suporte" ? VALIDADE_DA_SESSAO_DO_SUPORTE : VALIDADE_DA_SESSAO;
  return app.jwt.sign(payload, { expiresIn: validade });
}

// Token emitido antes da última troca de senha não vale mais. O `iat`
// do JWT é em segundos e o carimbo é em milissegundos: a comparação é
// no segundo, então o token que a própria troca devolve — emitido no
// mesmo segundo do carimbo — continua valendo. O preço é que um token
// roubado emitido naquele mesmo segundo também valeria, uma janela de
// menos de um segundo que ninguém consegue mirar.
function emitidoAntesDaTroca(
  payload: { iat?: number },
  senhaAlteradaEm: Date | null
): boolean {
  if (!senhaAlteradaEm || payload.iat === undefined) return false;
  return payload.iat < Math.floor(senhaAlteradaEm.getTime() / 1000);
}

type QualquerSessao = PayloadBarbeiro | PayloadCliente | PayloadSuporte;

// O 401 de toda recusa. O cookie recusado sai apagado na mesma resposta:
// sem isso o navegador o mandaria de novo em cada chamada, e cada uma
// custaria uma verificação à toa.
function recusar(
  reply: FastifyReply | undefined,
  tipo: TipoDeSessao,
  pedido: TokenDoPedido | null,
  motivo: string
): never {
  if (reply && pedido?.via === "cookie") apagarSessao(reply, tipo, pedido.slug);
  throw Object.assign(new Error(motivo), { statusCode: 401 });
}

// O token do pedido (cabeçalho ou cookie, lib/sessao-por-cookie.ts),
// verificado. O `request.user` é posto aqui, como o jwtVerify fazia: as
// rotas do painel leem `request.user.barbeariaId` direto.
function verificarSessao(
  request: FastifyRequest,
  reply: FastifyReply | undefined,
  tipo: TipoDeSessao
): { payload: QualquerSessao; pedido: TokenDoPedido } {
  const pedido = tokenDoPedido(request, tipo);
  if (!pedido) recusar(reply, tipo, pedido, "pedido sem sessão");
  let payload: QualquerSessao;
  try {
    payload = request.server.jwt.verify<QualquerSessao>(pedido.token);
  } catch {
    // O erro do verificador não tem statusCode e viraria 500.
    recusar(reply, tipo, pedido, "token inválido ou vencido");
  }
  (request as { user: unknown }).user = payload;
  return { payload, pedido };
}

// O mesmo, pros ganchos que nunca recusam: sessão que não confere é só
// sessão nenhuma.
function sessaoOpcional(request: FastifyRequest, tipo: TipoDeSessao): QualquerSessao | null {
  const pedido = tokenDoPedido(request, tipo);
  if (!pedido) return null;
  try {
    return request.server.jwt.verify<QualquerSessao>(pedido.token);
  } catch {
    return null;
  }
}

// Hook onRequest das rotas protegidas. Sem sessão, ou sessão que não
// confere: 401, que o tratador de erros repassa.
export async function autenticar(request: FastifyRequest, reply?: FastifyReply): Promise<void> {
  // O payload devolvido, e não o request.user: `user` está declarado
  // como PayloadBarbeiro, então `request.user.tipo` teria o tipo
  // literal "barbeiro" e o compilador trataria a comparação abaixo como
  // sempre falsa — a checagem funcionaria em runtime e pareceria código
  // morto pra quem refatorasse depois.
  const { payload, pedido } = verificarSessao(request, reply, "painel");

  if (payload.tipo !== "barbeiro") {
    recusar(reply, "painel", pedido, "token não é de barbeiro");
  }

  // Verificar a assinatura não basta: desativar um barbeiro não tiraria
  // o acesso de quem já tem token na mão. Uma query por requisição
  // protegida é o preço de a desativação ser real.
  const barbeiro = await prisma.barbeiro.findUnique({
    where: { id: payload.barbeiroId },
    select: { ativo: true, senhaAlteradaEm: true, papel: true, podeVenderPlanos: true },
  });

  if (!barbeiro?.ativo) {
    recusar(reply, "painel", pedido, "barbeiro inativo ou inexistente");
  }

  if (emitidoAntesDaTroca(payload, barbeiro.senhaAlteradaEm)) {
    recusar(reply, "painel", pedido, "token anterior à troca de senha");
  }

  // O papel vem do banco, não do token: a consulta já está paga, e
  // assim promover ou rebaixar alguém vale na próxima requisição, não
  // quando o token vencer.
  request.membro = {
    id: payload.barbeiroId,
    barbeariaId: payload.barbeariaId,
    papel: barbeiro.papel,
    podeVenderPlanos: barbeiro.podeVenderPlanos,
  };
}

// Nas rotas públicas de disponibilidade: quem pergunta é um membro desta
// barbearia (o Novo agendamento do painel)? Então a resposta sai sem as
// regras do cliente — o painel encaixa livre. Nunca recusa: sem token,
// token torto, de outra barbearia, de membro desativado ou anterior à
// troca de senha, a resposta é a do cliente. Mostrar a mais não abre
// brecha: o POST do cliente aplica as regras de novo.
export async function ehMembroDaBarbearia(request: FastifyRequest, barbeariaId: string): Promise<boolean> {
  const payload = sessaoOpcional(request, "painel");
  if (!payload || payload.tipo !== "barbeiro" || payload.barbeariaId !== barbeariaId) return false;

  const barbeiro = await prisma.barbeiro.findUnique({
    where: { id: payload.barbeiroId },
    select: { ativo: true, barbeariaId: true, senhaAlteradaEm: true },
  });
  return (
    !!barbeiro?.ativo &&
    barbeiro.barbeariaId === barbeariaId &&
    !emitidoAntesDaTroca(payload, barbeiro.senhaAlteradaEm)
  );
}

// Nas rotas públicas de disponibilidade: o cliente logado, ou null.
// Espelho do `ehMembroDaBarbearia`: nunca recusa — sem token, token
// torto, de outro tipo, de cliente apagado ou anterior à troca de
// senha, a resposta é a de quem não está logado.
export async function clienteDaRequisicao(request: FastifyRequest): Promise<string | null> {
  const pedido = tokenDoPedido(request, "cliente");
  if (!pedido) return null;

  let payload: QualquerSessao;
  try {
    payload = request.server.jwt.verify<QualquerSessao>(pedido.token);
  } catch {
    return null;
  }
  if (payload.tipo !== "cliente") return null;

  const cliente = await prisma.cliente.findUnique({
    where: { id: payload.clienteId },
    select: { senhaAlteradaEm: true, barbearia: { select: { slug: true } } },
  });
  if (!cliente || emitidoAntesDaTroca(payload, cliente.senhaAlteradaEm)) return null;
  // O cookie escolhido pelo cabeçalho tem que ser mesmo da barbearia
  // dele (ver o autenticarCliente).
  if (pedido.via === "cookie" && cliente.barbearia.slug !== pedido.slug) return null;
  return payload.clienteId;
}

// Lê o membro que o hook decorou — espelho do clienteDoToken.
export function membroDoToken(request: FastifyRequest): Membro {
  if (!request.membro) {
    throw Object.assign(new Error("rota do painel fora do escopo autenticado"), {
      statusCode: 401,
    });
  }
  return request.membro;
}

// Guarda de papel, pra pendurar no `onRequest` da rota. onRequest e não
// preHandler: o de rota roda depois do `autenticar` do escopo e ANTES
// da validação do corpo — a recusa não pode depender de o corpo estar
// certo, senão um 400 diria a quem não pode o formato que a rota espera.
// A matriz de quem pode o quê está em tests/routers/auth-papeis.test.ts.
export function exigirPapel(...papeis: PapelMembro[]) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!papeis.includes(membroDoToken(request).papel)) {
      throw new ErroHttp(403, "sem_permissao", "seu papel na equipe não permite isto");
    }
  };
}

// A parte do `where` que limita a agenda ao que o membro enxerga: o
// profissional, só a própria; dono e recepção, a da barbearia toda.
export function agendaVisivel(request: FastifyRequest): { barbeiroId?: string } {
  const membro = membroDoToken(request);
  return membro.papel === "profissional" ? { barbeiroId: membro.id } : {};
}

// Hook onRequest do escopo do cliente. Espelho do `autenticar`: recusa
// o tipo que não é o seu antes de tocar no banco, e consulta o cadastro
// pra que apagar um cliente invalide o token na hora, não em sete dias.
export async function autenticarCliente(request: FastifyRequest, reply?: FastifyReply): Promise<void> {
  const { payload, pedido } = verificarSessao(request, reply, "cliente");

  if (payload.tipo !== "cliente") {
    recusar(reply, "cliente", pedido, "token não é de cliente");
  }

  const cliente = await prisma.cliente.findUnique({
    where: { id: payload.clienteId },
    select: { id: true, senhaAlteradaEm: true, barbearia: { select: { slug: true } } },
  });

  if (!cliente) {
    recusar(reply, "cliente", pedido, "cliente inexistente");
  }

  if (emitidoAntesDaTroca(payload, cliente.senhaAlteradaEm)) {
    recusar(reply, "cliente", pedido, "token anterior à troca de senha");
  }

  // O cabeçalho só escolhe o cookie; quem diz de qual barbearia é a
  // sessão é o token. Os dois discordam quando a barbearia trocou de
  // link e outra pegou o antigo: o cookie velho não vale na página nova.
  if (pedido.via === "cookie" && cliente.barbearia.slug !== pedido.slug) {
    recusar(reply, "cliente", pedido, "sessão de outra barbearia");
  }

  request.cliente = payload;
}

// Lê o cliente que o hook decorou. `request.cliente` é opcional na
// declaração — a alternativa seria um `!` em cada uma das seis rotas do
// escopo, e isso dependeria de ninguém esquecer. Aqui o esquecimento
// vira 401, não `undefined` vazando pro Prisma.
export function clienteDoToken(request: FastifyRequest): PayloadCliente {
  if (!request.cliente) {
    throw Object.assign(new Error("rota de cliente fora do escopo autenticado"), {
      statusCode: 401,
    });
  }

  return request.cliente;
}

// Hook do escopo do suporte (bloco F4), irmão do do cliente e pelo mesmo
// motivo: identidade diferente, escopo diferente. Conta desativada ou
// token anterior à troca de senha param de valer na hora.
export async function autenticarSuporte(request: FastifyRequest, reply?: FastifyReply): Promise<void> {
  const { payload, pedido } = verificarSessao(request, reply, "suporte");

  if (payload.tipo !== "suporte") {
    recusar(reply, "suporte", pedido, "token não é do suporte");
  }

  const operador = await prisma.operadorSuporte.findUnique({
    where: { id: payload.operadorId },
    select: { ativo: true, senhaAlteradaEm: true },
  });

  if (!operador?.ativo) {
    recusar(reply, "suporte", pedido, "operador inativo ou inexistente");
  }

  if (emitidoAntesDaTroca(payload, operador.senhaAlteradaEm)) {
    recusar(reply, "suporte", pedido, "token anterior à troca de senha");
  }

  request.operador = payload;
}

// Lê o operador que o hook decorou; o esquecimento vira 401, não
// `undefined` vazando pro Prisma.
export function operadorDoToken(request: FastifyRequest): PayloadSuporte {
  if (!request.operador) {
    throw Object.assign(new Error("rota do suporte fora do escopo autenticado"), {
      statusCode: 401,
    });
  }
  return request.operador;
}
