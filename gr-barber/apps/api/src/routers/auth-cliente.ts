import { prisma } from "@gr-barber/database";
import { conflito } from "../lib/erro-http";
import type { LimitesDeAuth } from "../lib/limites";
import { PADRAO_TELEFONE } from "../lib/padroes";
import {
  conferirSenha,
  gerarHashSenha,
  obterHashDescartavel,
} from "../lib/senha";
import { serializarCliente } from "../lib/serializar";
import { normalizarTelefoneObrigatorio } from "../lib/telefone";
import type { App } from "../tipos";

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: "^[a-z0-9-]{3,80}$" } },
} as const;

const corpoSignup = {
  type: "object",
  required: ["nome", "telefone", "senha"],
  additionalProperties: false,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    senha: { type: "string", minLength: 8, maxLength: 200 },
  },
} as const;

const corpoLogin = {
  type: "object",
  required: ["telefone", "senha"],
  additionalProperties: false,
  properties: {
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    senha: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

// Públicas: são as telas de criar conta e entrar, abertas pelo link do
// WhatsApp. Ficam fora dos dois escopos protegidos do app.ts.
export function registrarRotasAuthCliente(
  app: App,
  limites: LimitesDeAuth
): void {
  app.post(
    "/barbearias/:slug/auth/cliente/signup",
    {
      schema: { params: paramsSlug, body: corpoSignup },
      // Por telefone antes de por IP: quem tenta reivindicar cadastros
      // em série varia o número, não o endereço. Ver lib/limites.ts.
      preHandler: limites.signupDoCliente,
    },
    async (request, reply) => {
      const { nome, senha } = request.body;
      // Normalizado antes da busca E da gravação: é o mesmo valor dos
      // dois lados que faz o cadastro ser encontrado depois.
      const telefone = normalizarTelefoneObrigatorio(request.body.telefone);

      // findUniqueOrThrow: slug inexistente vira P2025 -> 404.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      const existente = await prisma.cliente.findUnique({
        where: {
          barbeariaId_telefone: { barbeariaId: barbearia.id, telefone },
        },
      });

      // Definir senha só é permitido enquanto não existe uma. Sem posse
      // verificada do telefone (OTP), esta é a única barreira contra
      // alguém assumir o cadastro de outra pessoa — quem chegar
      // primeiro fica com ele, e é uma dívida registrada na spec e no
      // roadmap, não um esquecimento.
      if (existente?.senhaHash) {
        throw conflito("esse telefone já tem conta nesta barbearia");
      }

      const senhaHash = await gerarHashSenha(senha);

      // `nome` só entra na criação. Num cadastro que já existe, o nome
      // do signup é ignorado de propósito: mesma regra do `update: {}`
      // vazio do upsert público — quem digita o nome abreviado no
      // celular não renomeia o cadastro que o barbeiro ajustou.
      const cliente = existente
        ? await prisma.cliente.update({
            where: { id: existente.id },
            data: { senhaHash },
          })
        : await prisma.cliente.create({
            data: { barbeariaId: barbearia.id, nome, telefone, senhaHash },
          });

      const token = app.jwt.sign({
        tipo: "cliente",
        clienteId: cliente.id,
        barbeariaId: barbearia.id,
      });

      return reply.code(201).send({ token, cliente: serializarCliente(cliente) });
    }
  );

  app.post(
    "/barbearias/:slug/auth/cliente/login",
    // A chave por conta leva o slug junto: o mesmo telefone em duas
    // barbearias são duas contas, e uma não gasta o limite da outra.
    { schema: { params: paramsSlug, body: corpoLogin }, preHandler: limites.loginDoCliente },
    async (request, reply) => {
      const { senha } = request.body;
      // Mesma normalização da gravação. Sem ela, quem se cadastrou por
      // um formato não entraria digitando outro.
      const telefone = normalizarTelefoneObrigatorio(request.body.telefone);

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      const cliente = await prisma.cliente.findUnique({
        where: {
          barbeariaId_telefone: { barbeariaId: barbearia.id, telefone },
        },
      });

      // Telefone inexistente e cadastro sem senha (walk-in feito pelo
      // barbeiro) são tratados como "sem conta pra entrar": mesma
      // resposta, mesmo custo de uma senha errada.
      const autorizado = cliente?.senhaHash ? cliente : null;

      // Resolver o hash pra conferir num valor só, e chamar
      // conferirSenha exatamente uma vez pra qualquer ramo, é o que
      // garante que os três casos custem o mesmo: pular o
      // conferirSenha quando não há cliente faria essa resposta voltar
      // muito mais rápido, porque o scrypt é lento de propósito, e o
      // relógio entregaria o que o corpo esconde. Mesmo raciocínio do
      // login do barbeiro, em routers/auth.ts.
      const hashParaConferir =
        autorizado?.senhaHash ?? (await obterHashDescartavel());
      const senhaConfere = await conferirSenha(senha, hashParaConferir);

      // `credenciais_invalidas`, o mesmo do login do barbeiro. Esta rota
      // respondia `nao_autenticado`, que é o código de PROBLEMA COM O
      // TOKEN — é nele que o tratador central normaliza todo 401 que
      // passa por ele (plugins/erros.ts). Usar o mesmo código pras duas
      // coisas apagava a diferença entre "sua senha está errada" e "seu
      // token expirou", que pedem reações opostas de quem consome: uma
      // é digitar de novo, a outra é entrar de novo.
      //
      // Isso já custou um bug: a tela do painel ramificava só em
      // `nao_autenticado`, e senha errada caía no aviso genérico.
      if (!autorizado || !senhaConfere) {
        return reply.code(401).send({ erro: "credenciais_invalidas" });
      }

      const token = app.jwt.sign({
        tipo: "cliente",
        clienteId: autorizado.id,
        barbeariaId: barbearia.id,
      });

      return reply.send({ token, cliente: serializarCliente(autorizado) });
    }
  );
}
