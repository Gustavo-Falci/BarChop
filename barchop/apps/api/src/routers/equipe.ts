import type { FastifyRequest } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import { emitirCodigo } from "../lib/codigos";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { dateParaHora, horaParaDate } from "../lib/horas";
import { PADRAO_EMAIL, PADRAO_HORA, PADRAO_TELEFONE, PADRAO_UUID } from "../lib/padroes";
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

// A semana vai inteira, como no PUT de horários: sete dias, e o schema
// já recusa seis ou oito. Repetido passa no schema e cai no 422 abaixo.
const corpoPutJornada = {
  type: "object",
  additionalProperties: false,
  required: ["jornada"],
  properties: {
    jornada: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["diaSemana", "modo"],
        properties: {
          diaSemana: { type: "integer", minimum: 0, maximum: 6 },
          modo: { type: "string", enum: ["barbearia", "proprio", "folga"] },
          horaInicio: { type: ["string", "null"], pattern: PADRAO_HORA },
          horaFim: { type: ["string", "null"], pattern: PADRAO_HORA },
        },
      },
    },
  },
} as const;

const corpoPutServicos = {
  type: "object",
  additionalProperties: false,
  required: ["servicoIds"],
  properties: {
    servicoIds: {
      type: "array",
      maxItems: 200,
      items: { type: "string", pattern: PADRAO_UUID },
    },
  },
} as const;

function serializarDiaDaJornada(dia: {
  diaSemana: number;
  modo: string;
  horaInicio: Date | null;
  horaFim: Date | null;
}) {
  return {
    diaSemana: dia.diaSemana,
    modo: dia.modo,
    horaInicio: dia.horaInicio ? dateParaHora(dia.horaInicio) : null,
    horaFim: dia.horaFim ? dateParaHora(dia.horaFim) : null,
  };
}

// O membro existe nesta barbearia? Leitura e escrita da jornada e dos
// serviços passam por aqui: de outra barbearia é 404, como no PATCH.
async function garantirMembro(barbeariaId: string, id: string): Promise<void> {
  const achado = await prisma.barbeiro.findFirst({
    where: { id, barbeariaId },
    select: { id: true },
  });
  if (!achado) throw naoEncontrado();
}

async function lerJornada(barbeiroId: string) {
  const dias = await prisma.jornadaProfissional.findMany({
    where: { barbeiroId },
    orderBy: { diaSemana: "asc" },
  });
  return { jornada: dias.map(serializarDiaDaJornada) };
}

async function lerServicos(barbeiroId: string) {
  const linhas = await prisma.profissionalServico.findMany({
    where: { barbeiroId },
    select: { servicoId: true },
  });
  return { servicoIds: linhas.map((linha) => linha.servicoId) };
}

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
  fotoChave: string | null;
  senhaHash: string | null;
},
urlDaImagem: (chave: string) => string
) {
  return {
    id: membro.id,
    nome: membro.nome,
    email: membro.email,
    telefone: membro.telefone,
    papel: membro.papel,
    atende: membro.atende,
    ativo: membro.ativo,
    fotoUrl: membro.fotoChave ? urlDaImagem(membro.fotoChave) : null,
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

    return { membros: membros.map((membro) => serializarMembro(membro, app.armazenamento.urlPublica)) };
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

      return reply.code(201).send(serializarMembro(membro, app.armazenamento.urlPublica));
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

      return serializarMembro(membro, app.armazenamento.urlPublica);
    }
  );

  // Todos os papéis leem: a tela da agenda mostra quando cada um atende.
  app.get("/equipe/:id/jornada", { schema: { params: paramsComId } }, async (request) => {
    await garantirMembro(request.user.barbeariaId, request.params.id);
    return lerJornada(request.params.id);
  });

  app.put(
    "/equipe/:id/jornada",
    { schema: { params: paramsComId, body: corpoPutJornada }, onRequest: exigirPapel("dono") },
    async (request) => {
      const { id } = request.params;
      await garantirMembro(request.user.barbeariaId, id);

      // Toda a validação antes de gravar: um dia ruim no meio da lista
      // não pode deixar meia semana gravada (mesma regra dos horários).
      const vistos = new Set<number>();
      const dias = request.body.jornada.map((dia) => {
        if (vistos.has(dia.diaSemana)) {
          throw new ErroDeNegocio(
            `o dia ${dia.diaSemana} aparece mais de uma vez`,
            "dia_semana_duplicado"
          );
        }
        vistos.add(dia.diaSemana);

        // Hora em dia que não é próprio é descartada, não recusada: a
        // tela costuma mandar as horas antigas depois de trocar o modo,
        // como no `fechado` do funcionamento. O CHECK do banco exige
        // que fiquem nulas.
        if (dia.modo !== "proprio") {
          return { diaSemana: dia.diaSemana, modo: dia.modo, horaInicio: null, horaFim: null };
        }
        if (!dia.horaInicio || !dia.horaFim) {
          throw new ErroDeNegocio(
            `o dia ${dia.diaSemana} tem horário próprio sem entrada e saída`,
            "horario_incompleto"
          );
        }
        // "HH:mm" compara como texto na ordem do relógio.
        if (dia.horaInicio >= dia.horaFim) {
          throw new ErroDeNegocio(
            `no dia ${dia.diaSemana} a entrada precisa ser antes da saída`,
            "intervalo_invalido"
          );
        }
        return {
          diaSemana: dia.diaSemana,
          modo: dia.modo,
          horaInicio: horaParaDate(dia.horaInicio),
          horaFim: horaParaDate(dia.horaFim),
        };
      });

      // Update e não upsert: as sete linhas existem desde o insert do
      // membro (trigger da migration 20261004120000).
      await prisma.$transaction(
        dias.map(({ diaSemana, ...resto }) =>
          prisma.jornadaProfissional.update({
            where: { barbeiroId_diaSemana: { barbeiroId: id, diaSemana } },
            data: resto,
          })
        )
      );

      return lerJornada(id);
    }
  );

  app.get("/equipe/:id/servicos", { schema: { params: paramsComId } }, async (request) => {
    await garantirMembro(request.user.barbeariaId, request.params.id);
    return lerServicos(request.params.id);
  });

  // A lista inteira, como a jornada: o que não veio deixa de ser feito.
  app.put(
    "/equipe/:id/servicos",
    { schema: { params: paramsComId, body: corpoPutServicos }, onRequest: exigirPapel("dono") },
    async (request) => {
      const { id } = request.params;
      const { barbeariaId } = request.user;
      await garantirMembro(barbeariaId, id);

      const idsUnicos = [...new Set(request.body.servicoIds)];
      const daBarbearia = await prisma.servico.count({
        where: { id: { in: idsUnicos }, barbeariaId },
      });
      if (daBarbearia !== idsUnicos.length) {
        throw new ErroDeNegocio("serviço não encontrado nesta barbearia", "servico_invalido");
      }

      await prisma.$transaction([
        prisma.profissionalServico.deleteMany({ where: { barbeiroId: id } }),
        prisma.profissionalServico.createMany({
          data: idsUnicos.map((servicoId) => ({ barbeiroId: id, servicoId })),
        }),
      ]);

      return lerServicos(id);
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
