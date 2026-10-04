import type { FastifyRequest } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import { emitirCodigo } from "../lib/codigos";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { PADRAO_EMAIL, PADRAO_TELEFONE, PADRAO_UUID } from "../lib/padroes";
import { normalizarTelefone } from "../lib/telefone";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// A equipe da barbearia. A tabela continua `barbeiro` (decisão 1 do
// plano da Onda 1): o nome é histórico, o conceito é "membro".
//
// O membro nasce sem senha e recebe um convite por e-mail; só entra
// depois de aceitar (POST /auth/convite/aceitar, em routers/auth.ts).

const PAPEIS = ["dono", "profissional", "recepcao"] as const;

const corpoNovoMembro = {
  type: "object",
  required: ["nome", "email", "papel"],
  additionalProperties: false,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
    papel: { type: "string", enum: PAPEIS },
    telefone: { type: ["string", "null"], pattern: PADRAO_TELEFONE, maxLength: 20 },
    atende: { type: "boolean" },
  },
} as const;

// E-mail fica fora: é a chave do login, e trocá-lo pelas costas do
// membro mudaria por onde ele entra.
const corpoPatchMembro = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: { type: ["string", "null"], pattern: PADRAO_TELEFONE, maxLength: 20 },
    papel: { type: "string", enum: PAPEIS },
    atende: { type: "boolean" },
    ativo: { type: "boolean" },
  },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// Campos listados um a um, nunca spread do registro: é o que garante
// que senhaHash não escape. Dele sai só o "convite pendente".
function serializarMembro(membro: {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  papel: string;
  atende: boolean;
  ativo: boolean;
  fotoUrl: string | null;
  senhaHash: string | null;
}) {
  return {
    id: membro.id,
    nome: membro.nome,
    email: membro.email,
    telefone: membro.telefone,
    papel: membro.papel,
    atende: membro.atende,
    ativo: membro.ativo,
    fotoUrl: membro.fotoUrl,
    convitePendente: membro.senhaHash === null,
  };
}

// O convite só sai por e-mail. Conferido antes de criar: um membro sem
// senha e sem código pra definir uma ficaria pendurado.
function exigirCanalDeEmail(app: App): void {
  if (!app.canal.destinos.includes("email")) {
    throw new ErroDeNegocio(
      "a plataforma ainda não envia e-mail, e o convite sai por e-mail",
      "destino_indisponivel"
    );
  }
}

// O envio não é aguardado, como no /auth/codigo: uma falha do provedor
// fica no log, e o dono reenvia pela própria equipe.
async function enviarConvite(
  app: App,
  request: FastifyRequest,
  membro: { email: string; barbeariaId: string }
): Promise<void> {
  const barbearia = await prisma.barbearia.findUniqueOrThrow({
    where: { id: membro.barbeariaId },
    select: { nome: true },
  });
  // barbeariaId nulo, como no esqueci-a-senha: o e-mail do membro é
  // único na plataforma, e o aceite não sabe a barbearia antes de provar
  // o código.
  const codigo = await emitirCodigo({
    finalidade: "convite_profissional",
    destino: membro.email,
    barbeariaId: null,
  });

  // O link só sai com URL_DO_PAINEL configurada: sem ela não há
  // endereço certo a apontar, e um link pra lugar nenhum é pior que o
  // código sozinho. O e-mail vai na query pra a tela já chegar com ele.
  const painel = process.env.URL_DO_PAINEL?.replace(/\/+$/, "");
  const link = painel
    ? ` Abra ${painel}/painel/convite?email=${encodeURIComponent(membro.email)} para começar.`
    : "";

  void app.canal
    .enviar({
      para: membro.email,
      assunto: `Convite para a equipe da ${barbearia.nome} no BarChop`,
      texto:
        `${barbearia.nome} convidou você para a equipe no BarChop. ` +
        `Seu código de convite é ${codigo}. Vale 7 dias: use-o para ` +
        `definir sua senha e entrar no painel.${link}`,
    })
    .catch((erro: unknown) => request.log.error({ erro }, "falha ao enviar o convite"));
}

// O papel que sai de "dono" ou o dono desativado: as duas mudanças que
// podem deixar a barbearia sem ninguém pra configurá-la.
function tiraUmDono(corpo: { papel?: string; ativo?: boolean }): boolean {
  return (corpo.papel !== undefined && corpo.papel !== "dono") || corpo.ativo === false;
}

export function registrarRotasEquipe(app: App): void {
  // Todos os papéis leem: a recepção marca pra qualquer profissional e
  // precisa da lista; o profissional vê os colegas na agenda.
  app.get("/equipe", async (request) => {
    const membros = await prisma.barbeiro.findMany({
      where: { barbeariaId: request.user.barbeariaId },
      orderBy: [{ ativo: "desc" }, { criadoEm: "asc" }, { id: "asc" }],
    });

    return { membros: membros.map(serializarMembro) };
  });

  app.post(
    "/equipe",
    { schema: { body: corpoNovoMembro }, onRequest: exigirPapel("dono") },
    async (request, reply) => {
      exigirCanalDeEmail(app);

      const { nome, papel, telefone, atende } = request.body;
      // `!`: o schema exige e-mail não vazio, como no signup.
      const email = normalizarEmail(request.body.email)!;

      let membro;
      try {
        membro = await prisma.barbeiro.create({
          data: {
            barbeariaId: request.user.barbeariaId,
            nome,
            email,
            papel,
            // A recepção não atende por padrão; o dono diz se atende.
            atende: atende ?? papel !== "recepcao",
            ...(telefone !== undefined ? { telefone: normalizarTelefone(telefone) } : {}),
          },
        });
      } catch (erro) {
        // O e-mail é a chave do login, única na plataforma: no piloto um
        // profissional não está em duas barbearias. Código próprio, e não
        // o `conflito` genérico, pra tela dizer qual campo bateu.
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
          throw new ErroHttp(409, "email_em_uso", "esse e-mail já tem conta no BarChop");
        }
        throw erro;
      }

      await enviarConvite(app, request, { email, barbeariaId: membro.barbeariaId });

      return reply.code(201).send(serializarMembro(membro));
    }
  );

  app.patch(
    "/equipe/:id",
    {
      schema: { params: paramsComId, body: corpoPatchMembro },
      onRequest: exigirPapel("dono"),
    },
    async (request) => {
      const { id } = request.params;
      const { barbeariaId } = request.user;
      const { telefone, ...resto } = request.body;
      const data = {
        ...resto,
        ...(telefone !== undefined ? { telefone: normalizarTelefone(telefone) } : {}),
      };

      const membro = await prisma.$transaction(async (tx) => {
        if (tiraUmDono(request.body)) {
          // A linha da barbearia é o cadeado: dois donos se rebaixando ao
          // mesmo tempo leriam, cada um, "há outro dono" e os dois
          // gravariam. Com a trava, o segundo espera o primeiro e conta
          // de novo. NO KEY UPDATE, e não UPDATE, pra não segurar quem só
          // referencia a barbearia (um agendamento sendo criado).
          await tx.$queryRaw`SELECT id FROM barbearia WHERE id = ${barbeariaId}::uuid FOR NO KEY UPDATE`;

          const atual = await tx.barbeiro.findFirst({ where: { id, barbeariaId } });
          if (!atual) throw naoEncontrado();

          // Conta quem consegue entrar: ativo e com senha. Um dono
          // convidado que ainda não aceitou não segura a barbearia.
          if (atual.papel === "dono" && atual.ativo && atual.senhaHash !== null) {
            const outros = await tx.barbeiro.count({
              where: {
                barbeariaId,
                papel: "dono",
                ativo: true,
                senhaHash: { not: null },
                id: { not: id },
              },
            });
            if (outros === 0) {
              throw new ErroDeNegocio(
                "a barbearia precisa de pelo menos um dono ativo",
                "ultimo_dono"
              );
            }
          }
        }

        // barbeariaId no MESMO where da escrita: membro de outra
        // barbearia vira P2025, que o tratador central devolve como 404.
        return tx.barbeiro.update({ where: { id, barbeariaId }, data });
      });

      return serializarMembro(membro);
    }
  );

  app.post(
    "/equipe/:id/convite",
    { schema: { params: paramsComId }, onRequest: exigirPapel("dono") },
    async (request, reply) => {
      const membro = await prisma.barbeiro.findFirst({
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId, ativo: true },
      });
      if (!membro?.email) throw naoEncontrado();

      // Quem já tem senha usa o esqueci-a-senha, de 10 minutos. Um
      // convite aqui seria uma redefinição que vale 7 dias.
      if (membro.senhaHash !== null) {
        throw new ErroDeNegocio(
          "esse membro já aceitou o convite",
          "convite_desnecessario"
        );
      }

      exigirCanalDeEmail(app);
      await enviarConvite(app, request, { email: membro.email, barbeariaId: membro.barbeariaId });

      return reply.code(202).send({ enviado: true });
    }
  );
}
