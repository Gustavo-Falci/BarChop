import fastifyJwt from "@fastify/jwt";
import type { FastifyRequest } from "fastify";
import { prisma, type PapelMembro } from "@barchop/database";
import { ErroHttp } from "../lib/erro-http";
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
    // lembrete...
    payload: PayloadBarbeiro | PayloadCliente | PayloadLembrete | PayloadSuporte;
    // ...mas `request.user` é lido só dentro do escopo protegido do
    // barbeiro, onde o hook abaixo já garantiu qual é. Declarar a união
    // aqui obrigaria narrowing em seis arquivos de rota que hoje leem
    // `request.user.barbeariaId` direto, sem ganhar segurança nenhuma:
    // quem garante não é o tipo, é o hook.
    user: PayloadBarbeiro;
  }
}

export function registrarAuth(app: App): void {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) {
    throw new Error("JWT_SECRET não definido — veja apps/api/.env.example");
  }

  // Token com prazo. Com o hook lendo o banco a revogação já é
  // imediata; a expiração é defesa em profundidade contra token
  // roubado. Decidir agora evita retrofitar tratamento de 401 e novo
  // login nas telas depois que elas assumirem token eterno.
  app.register(fastifyJwt, { secret: segredo, sign: { expiresIn: "7d" } });
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

// Hook onRequest das rotas protegidas. Token ausente ou inválido faz o
// jwtVerify lançar com statusCode 401, que o tratador de erros repassa.
export async function autenticar(request: FastifyRequest): Promise<void> {
  // O retorno do jwtVerify, e não o request.user: `user` está declarado
  // como PayloadBarbeiro, então `request.user.tipo` teria o tipo
  // literal "barbeiro" e o compilador trataria a comparação abaixo como
  // sempre falsa — a checagem funcionaria em runtime e pareceria código
  // morto pra quem refatorasse depois.
  const payload = await request.jwtVerify<PayloadBarbeiro | PayloadCliente>();

  if (payload.tipo !== "barbeiro") {
    throw Object.assign(new Error("token não é de barbeiro"), {
      statusCode: 401,
    });
  }

  // Verificar a assinatura não basta: desativar um barbeiro não tiraria
  // o acesso de quem já tem token na mão. Uma query por requisição
  // protegida é o preço de a desativação ser real.
  const barbeiro = await prisma.barbeiro.findUnique({
    where: { id: payload.barbeiroId },
    select: { ativo: true, senhaAlteradaEm: true, papel: true },
  });

  if (!barbeiro?.ativo) {
    throw Object.assign(new Error("barbeiro inativo ou inexistente"), {
      statusCode: 401,
    });
  }

  if (emitidoAntesDaTroca(payload, barbeiro.senhaAlteradaEm)) {
    throw Object.assign(new Error("token anterior à troca de senha"), {
      statusCode: 401,
    });
  }

  // O papel vem do banco, não do token: a consulta já está paga, e
  // assim promover ou rebaixar alguém vale na próxima requisição, não
  // quando o token vencer.
  request.membro = {
    id: payload.barbeiroId,
    barbeariaId: payload.barbeariaId,
    papel: barbeiro.papel,
  };
}

// Nas rotas públicas de disponibilidade: quem pergunta é um membro desta
// barbearia (o Novo agendamento do painel)? Então a resposta sai sem as
// regras do cliente — o painel encaixa livre. Nunca recusa: sem token,
// token torto, de outra barbearia, de membro desativado ou anterior à
// troca de senha, a resposta é a do cliente. Mostrar a mais não abre
// brecha: o POST do cliente aplica as regras de novo.
export async function ehMembroDaBarbearia(request: FastifyRequest, barbeariaId: string): Promise<boolean> {
  if (!request.headers.authorization) return false;

  let payload: PayloadBarbeiro | PayloadCliente | PayloadSuporte;
  try {
    payload = await request.jwtVerify<PayloadBarbeiro | PayloadCliente | PayloadSuporte>();
  } catch {
    return false;
  }
  if (payload.tipo !== "barbeiro" || payload.barbeariaId !== barbeariaId) return false;

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
export async function autenticarCliente(request: FastifyRequest): Promise<void> {
  const payload = await request.jwtVerify<PayloadBarbeiro | PayloadCliente>();

  if (payload.tipo !== "cliente") {
    throw Object.assign(new Error("token não é de cliente"), {
      statusCode: 401,
    });
  }

  const cliente = await prisma.cliente.findUnique({
    where: { id: payload.clienteId },
    select: { id: true, senhaAlteradaEm: true },
  });

  if (!cliente) {
    throw Object.assign(new Error("cliente inexistente"), { statusCode: 401 });
  }

  if (emitidoAntesDaTroca(payload, cliente.senhaAlteradaEm)) {
    throw Object.assign(new Error("token anterior à troca de senha"), {
      statusCode: 401,
    });
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
export async function autenticarSuporte(request: FastifyRequest): Promise<void> {
  const payload = await request.jwtVerify<PayloadSuporte | PayloadBarbeiro | PayloadCliente>();

  if (payload.tipo !== "suporte") {
    throw Object.assign(new Error("token não é do suporte"), { statusCode: 401 });
  }

  const operador = await prisma.operadorSuporte.findUnique({
    where: { id: payload.operadorId },
    select: { ativo: true, senhaAlteradaEm: true },
  });

  if (!operador?.ativo) {
    throw Object.assign(new Error("operador inativo ou inexistente"), { statusCode: 401 });
  }

  if (emitidoAntesDaTroca(payload, operador.senhaAlteradaEm)) {
    throw Object.assign(new Error("token anterior à troca de senha"), { statusCode: 401 });
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
