import { prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import { consumirCodigo, emitirCodigo } from "../lib/codigos";
import { ErroDeNegocio } from "../lib/erro-negocio";
import type { LimitesDeAuth } from "../lib/limites";
import { PADRAO_EMAIL, PADRAO_SLUG, PADRAO_TELEFONE } from "../lib/padroes";
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
  properties: { slug: { type: "string", pattern: PADRAO_SLUG } },
} as const;

const campoTelefone = { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 } as const;
const campoEmail = { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 } as const;

// Telefone OU e-mail, nunca os dois: é por ele que o código sai, e com
// os dois a rota teria que escolher em silêncio. No piloto o canal só
// entrega e-mail (plano da Onda 1); o telefone fica pronto pro WhatsApp.
const corpoCodigo = {
  type: "object",
  additionalProperties: false,
  properties: { telefone: campoTelefone, email: campoEmail },
  oneOf: [{ required: ["telefone"] }, { required: ["email"] }],
} as const;

// `nome` obrigatório mesmo pra quem já tem cadastro (e lá ele é
// ignorado). Exigido só no cadastro novo, "falta o nome" e "código
// inválido" responderiam diferente — e a diferença diria quem tem
// cadastro antes de qualquer prova de posse do telefone.
//
// Com `email`, a prova é do e-mail, e o telefone vai junto pelo mesmo
// motivo do nome: o cadastro novo precisa dele (a coluna é obrigatória),
// e exigi-lo só ali diria quem já tem conta.
const corpoSenha = {
  type: "object",
  required: ["telefone", "codigo", "senha", "nome"],
  additionalProperties: false,
  properties: {
    telefone: campoTelefone,
    email: campoEmail,
    codigo: { type: "string", pattern: "^[0-9]{6}$" },
    senha: { type: "string", minLength: 8, maxLength: 200 },
    nome: { type: "string", minLength: 2, maxLength: 120 },
  },
} as const;

const corpoLogin = {
  type: "object",
  required: ["senha"],
  additionalProperties: false,
  properties: {
    telefone: campoTelefone,
    email: campoEmail,
    senha: { type: "string", minLength: 1, maxLength: 200 },
  },
  oneOf: [{ required: ["telefone"] }, { required: ["email"] }],
} as const;

type Identidade = { tipo: "email" | "telefone"; valor: string };

// O valor que identifica o cliente nas três rotas, já normalizado: é o
// destino do código e a chave da busca, e os dois têm que ser o mesmo
// valor pra confirmação achar o código. Com e-mail no corpo, é ele.
function identidade(corpo: { telefone?: string; email?: string }): Identidade {
  const email = normalizarEmail(corpo.email);
  if (email) return { tipo: "email", valor: email };
  return { tipo: "telefone", valor: normalizarTelefoneObrigatorio(corpo.telefone ?? "") };
}

function ondeEstaOCliente(barbeariaId: string, quem: Identidade) {
  return quem.tipo === "email"
    ? { barbeariaId_email: { barbeariaId, email: quem.valor } }
    : { barbeariaId_telefone: { barbeariaId, telefone: quem.valor } };
}

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
      const destino = identidade(request.body);

      // Antes do banco e antes de emitir: um código que não tem por onde
      // sair não deve existir, e o envio falharia com 500 lá embaixo.
      // Não diz nada sobre contas — depende só da configuração da API.
      if (!app.canal.destinos.includes(destino.tipo)) {
        throw new ErroDeNegocio(
          "a barbearia ainda não envia código por este meio",
          "destino_indisponivel"
        );
      }

      // findUniqueOrThrow: slug inexistente vira P2025 -> 404, antes de
      // mandar qualquer coisa.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true, nome: true },
      });

      const codigo = await emitirCodigo({
        finalidade: "senha_cliente",
        destino: destino.valor,
        barbeariaId: barbearia.id,
      });

      // O nome da barbearia na mensagem: sem ele, é um código solto no
      // WhatsApp, igual ao de um golpe pedindo "me passa o código".
      await app.canal.enviar({
        para: destino.valor,
        assunto: `${barbearia.nome}: seu código de acesso`,
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
      const provar = identidade(request.body);

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      // O código antes de tudo: é a prova de posse do telefone (ou do
      // e-mail), e sem ela nada sobre o cadastro deve ser lido nem
      // respondido.
      const provado = await consumirCodigo(
        { finalidade: "senha_cliente", destino: provar.valor, barbeariaId: barbearia.id },
        codigo
      );
      if (!provado) {
        throw new ErroDeNegocio("código inválido ou vencido", "codigo_invalido");
      }

      const existente = await prisma.cliente.findUnique({
        where: ondeEstaOCliente(barbearia.id, provar),
      });

      // E-mail provado, sem cadastro com ele, e o telefone já é de outro
      // cadastro: recusa em vez de vincular. Vincular seria tomar a
      // conta — quem controla um e-mail qualquer e sabe o telefone de um
      // cliente do balcão herdaria o histórico dele. O caminho seguro é
      // a barbearia incluir o e-mail no cadastro, e aí o `existente`
      // acima acha. Dizer que o telefone tem cadastro, depois da prova
      // do e-mail, é o preço aceito disso.
      if (!existente && provar.tipo === "email") {
        const outro = await prisma.cliente.findUnique({
          where: ondeEstaOCliente(barbearia.id, { tipo: "telefone", valor: telefone }),
          select: { id: true },
        });
        if (outro) {
          throw new ErroDeNegocio(
            "este telefone já tem cadastro na barbearia; peça pra incluírem seu e-mail nele",
            "telefone_ja_cadastrado"
          );
        }
      }

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
            // O carimbo derruba as sessões abertas: o hook recusa token
            // emitido antes dele. Quem esqueceu a senha porque o celular
            // foi roubado não pode deixar o ladrão logado por 7 dias.
            data: { senhaHash, senhaAlteradaEm: new Date() },
          })
        : await prisma.cliente.create({
            data: {
              barbeariaId: barbearia.id,
              nome,
              telefone,
              email: provar.tipo === "email" ? provar.valor : null,
              senhaHash,
            },
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
      const quem = identidade(request.body);

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      const cliente = await prisma.cliente.findUnique({
        where: ondeEstaOCliente(barbearia.id, quem),
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
