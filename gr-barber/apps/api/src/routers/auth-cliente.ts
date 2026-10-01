import { prisma } from "@gr-barber/database";
import { consumirCodigo, emitirCodigo } from "../lib/codigos";
import { ErroDeNegocio } from "../lib/erro-negocio";
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

const corpoCodigo = {
  type: "object",
  required: ["telefone"],
  additionalProperties: false,
  properties: {
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
  },
} as const;

// `nome` obrigatório mesmo pra quem já tem cadastro (e lá ele é
// ignorado). Exigido só no cadastro novo, "falta o nome" e "código
// inválido" responderiam diferente — e a diferença diria quem tem
// cadastro antes de qualquer prova de posse do telefone.
const corpoSenha = {
  type: "object",
  required: ["telefone", "codigo", "senha", "nome"],
  additionalProperties: false,
  properties: {
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    codigo: { type: "string", pattern: "^[0-9]{6}$" },
    senha: { type: "string", minLength: 8, maxLength: 200 },
    nome: { type: "string", minLength: 2, maxLength: 120 },
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
  // Primeiro acesso e esqueci a senha são, pro cliente, a mesma coisa:
  // provar que o telefone é dele e definir a senha. Esta rota manda o
  // código; a de baixo confere e define.
  //
  // A resposta é igual tendo ou não cadastro, e o código vai nos dois
  // casos: o signup antigo respondia 409 pra telefone com conta, e isso
  // dizia a quem sondasse quem é cliente de qual barbearia.
  app.post(
    "/barbearias/:slug/auth/cliente/codigo",
    {
      schema: { params: paramsSlug, body: corpoCodigo },
      preHandler: limites.codigoDoCliente,
    },
    async (request, reply) => {
      // Normalizado: é o destino do código e a chave do cadastro, e os
      // dois têm que ser o mesmo valor pra confirmação achar o código.
      const telefone = normalizarTelefoneObrigatorio(request.body.telefone);

      // findUniqueOrThrow: slug inexistente vira P2025 -> 404, antes de
      // mandar qualquer coisa.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true, nome: true },
      });

      const codigo = await emitirCodigo({
        finalidade: "senha_cliente",
        destino: telefone,
        barbeariaId: barbearia.id,
      });

      // O nome da barbearia na mensagem: sem ele, é um código solto no
      // WhatsApp, igual ao de um golpe pedindo "me passa o código".
      await app.canal.enviar({
        para: telefone,
        texto:
          `${barbearia.nome}: seu código de acesso é ${codigo}. ` +
          "Vale 10 minutos. Não passe este código pra ninguém.",
      });

      return reply.code(202).send({ enviado: true });
    }
  );

  app.post(
    "/barbearias/:slug/auth/cliente/senha",
    {
      schema: { params: paramsSlug, body: corpoSenha },
      preHandler: limites.senhaDoCliente,
    },
    async (request, reply) => {
      const { nome, senha, codigo } = request.body;
      const telefone = normalizarTelefoneObrigatorio(request.body.telefone);

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      // O código antes de tudo: é a prova de posse do telefone, e sem
      // ela nada sobre o cadastro deve ser lido nem respondido.
      const provado = await consumirCodigo(
        { finalidade: "senha_cliente", destino: telefone, barbeariaId: barbearia.id },
        codigo
      );
      if (!provado) {
        throw new ErroDeNegocio("código inválido ou vencido", "codigo_invalido");
      }

      const existente = await prisma.cliente.findUnique({
        where: {
          barbeariaId_telefone: { barbeariaId: barbearia.id, telefone },
        },
      });

      const senhaHash = await gerarHashSenha(senha);

      // `nome` só entra na criação. Num cadastro que já existe, o nome
      // daqui é ignorado de propósito: mesma regra do `update: {}`
      // vazio do upsert público — quem digita o nome abreviado no
      // celular não renomeia o cadastro que o barbeiro ajustou. Com
      // senha ou sem, o cadastro existente recebe a senha nova: com o
      // telefone provado, é o dono definindo ou recuperando a dele.
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

      return reply
        .code(existente ? 200 : 201)
        .send({ token, cliente: serializarCliente(cliente) });
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
