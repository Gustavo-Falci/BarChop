import fastifyJwt from "@fastify/jwt";
import type { FastifyRequest } from "fastify";
import { prisma } from "@barchop/database";
import type { App } from "../tipos";

// As duas identidades da plataforma. O `tipo` é o que separa uma da
// outra dentro de um token: sem ele, um token de cliente e um de
// barbeiro só se distinguiriam pelos campos presentes, e um payload
// forjado com os dois passaria pelos dois hooks.
export interface PayloadBarbeiro {
  tipo: "barbeiro";
  barbeiroId: string;
  barbeariaId: string;
}

export interface PayloadCliente {
  tipo: "cliente";
  clienteId: string;
  barbeariaId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    // Preenchido só pelo autenticarCliente. Opcional porque o tipo vale
    // pra toda requisição da aplicação, inclusive as do barbeiro.
    cliente?: PayloadCliente;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    // O que se assina pode ser qualquer uma das duas...
    payload: PayloadBarbeiro | PayloadCliente;
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
    select: { ativo: true },
  });

  if (!barbeiro?.ativo) {
    throw Object.assign(new Error("barbeiro inativo ou inexistente"), {
      statusCode: 401,
    });
  }
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
    select: { id: true },
  });

  if (!cliente) {
    throw Object.assign(new Error("cliente inexistente"), { statusCode: 401 });
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
