import type { FastifyRequest } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import { garantirVagaNoPlano, sincronizarQuantidade } from "../lib/assinatura";
import { emitirCodigo } from "../lib/codigos";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { INCLUIR_PAUSAS } from "../lib/disponibilidade";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { dateParaHora, horaParaDate } from "../lib/horas";
import { corpoDaOrdem, garantirMesmoConjunto, ordemNaPosicao } from "../lib/ordem";
import { PADRAO_EMAIL, PADRAO_HORA, PADRAO_TELEFONE, PADRAO_UUID } from "../lib/padroes";
import { ONLINE_A_CANCELAR, cancelarNoProvedor } from "../lib/planos-do-cliente";
import { normalizarTelefone } from "../lib/telefone";
import { exigirPapel } from "../plugins/auth";
import type { LimitesDaEquipe } from "../lib/limites";
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
    // Os planos do cliente (Onda 2, marco 3): o dono libera o membro pra
    // vender. Tirar não mexe nas assinaturas que já existem.
    podeVenderPlanos: { type: "boolean" },
    // Desativar quem tem assinantes vivos nos planos que vende exige a
    // confirmação: as assinaturas são canceladas no mesmo passo.
    cancelarAssinaturas: { type: "boolean" },
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
          // As pausas do dia (08/11/2026). Os itens aceitam exatamente o
          // que o GET devolve. O teto é técnico, contra corpo gigante;
          // ninguém chega nele. Sem elas, o dia fica sem pausa.
          pausas: {
            type: "array",
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["inicio", "fim"],
              properties: {
                inicio: { type: "string", pattern: PADRAO_HORA },
                fim: { type: "string", pattern: PADRAO_HORA },
              },
            },
          },
          // A pausa única de antes, que saiu do contrato no PR 3 das
          // várias pausas. Só uma aba com a web antiga ainda manda: o
          // schema deixa passar, sem conferir o formato, pra o handler
          // responder 422 `recarregue_a_pagina` em vez de um 400 ilegível.
          pausaInicio: { type: ["string", "null"] },
          pausaFim: { type: ["string", "null"] },
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

interface FaixaDePausa {
  inicio: string; // "HH:mm"
  fim: string;
}

function serializarDiaDaJornada(dia: {
  diaSemana: number;
  modo: string;
  horaInicio: Date | null;
  horaFim: Date | null;
  pausas: { horaInicio: Date; horaFim: Date }[];
}) {
  const pausas = dia.pausas.map((pausa) => ({
    inicio: dateParaHora(pausa.horaInicio),
    fim: dateParaHora(pausa.horaFim),
  }));
  return {
    diaSemana: dia.diaSemana,
    modo: dia.modo,
    horaInicio: dia.horaInicio ? dateParaHora(dia.horaInicio) : null,
    horaFim: dia.horaFim ? dateParaHora(dia.horaFim) : null,
    pausas,
  };
}

// "HH:mm" compara como texto na ordem do relógio.
function exigirNaOrdem(diaSemana: number, pausa: FaixaDePausa): void {
  if (pausa.inicio >= pausa.fim) {
    throw new ErroDeNegocio(
      `no dia ${diaSemana} a pausa precisa começar antes de terminar`,
      "pausa_invalida"
    );
  }
}

// A lista de `pausas`, validada e em ordem de início. Encostar pode
// (12:00–13:00 e 13:00–13:30); cruzar, não. A EXCLUDE
// `pausas_sem_cruzar` recusaria depois, mas com um 500.
function listaDePausas(diaSemana: number, pausas: FaixaDePausa[]): FaixaDePausa[] {
  for (const pausa of pausas) exigirNaOrdem(diaSemana, pausa);
  const emOrdem = [...pausas].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
  for (let i = 1; i < emOrdem.length; i += 1) {
    const antes = emOrdem[i - 1];
    const depois = emOrdem[i];
    if (depois.inicio < antes.fim) {
      throw new ErroDeNegocio(
        `no dia ${diaSemana} as pausas ${antes.inicio}–${antes.fim} e ${depois.inicio}–${depois.fim} se cruzam`,
        "pausas_se_cruzam"
      );
    }
  }
  return emOrdem;
}

// As pausas que o dia vai ter. Folga não tem: as que vierem são
// descartadas, como as horas num dia que não é próprio (a tela manda o
// que estava antes de trocar o modo).
function pausasDoDia(dia: { diaSemana: number; modo: string; pausas?: FaixaDePausa[] }): FaixaDePausa[] {
  if (dia.modo === "folga") return [];
  return listaDePausas(dia.diaSemana, dia.pausas ?? []);
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
    include: INCLUIR_PAUSAS,
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
  podeVenderPlanos: boolean;
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
    podeVenderPlanos: membro.podeVenderPlanos,
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

// Quem conta no limite do plano: ativo, dono ou profissional. A
// recepção não conta (lib/assinatura.ts).
function contaNoPlano(membro: { ativo?: boolean; papel?: string }): boolean {
  return membro.ativo === true && (membro.papel === "dono" || membro.papel === "profissional");
}

export function registrarRotasEquipe(app: App, limites: LimitesDaEquipe): void {
  // Todos os papéis leem: a recepção marca pra qualquer profissional e
  // precisa da lista; o profissional vê os colegas na agenda.
  //
  // Os inativos depois dos ativos; dentro de cada parte, a ordem que o
  // dono arrastou. Só exibição: o limite do Grátis e o "qualquer um"
  // seguem por `criadoEm` (lib/assinatura.ts, lib/disponibilidade.ts).
  async function listaDaEquipe(barbeariaId: string) {
    const membros = await prisma.barbeiro.findMany({
      where: { barbeariaId },
      orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { id: "asc" }],
    });
    return { membros: membros.map((membro) => serializarMembro(membro, app.armazenamento.urlPublica)) };
  }

  app.get("/equipe", async (request) => listaDaEquipe(request.user.barbeariaId));

  // A lista inteira, de uma vez (lib/ordem.ts), com os inativos e os
  // convites pendentes junto: todo membro tem lugar na ordem.
  app.put(
    "/equipe/ordem",
    { schema: { body: corpoDaOrdem }, onRequest: exigirPapel("dono") },
    async (request) => {
      const { barbeariaId } = request.user;
      const { ids } = request.body;
      await prisma.$transaction(async (tx) => {
        const daBarbearia = await tx.barbeiro.findMany({ where: { barbeariaId }, select: { id: true } });
        garantirMesmoConjunto(ids, daBarbearia.map((membro) => membro.id), "todos os membros");
        for (const [indice, id] of ids.entries()) {
          await tx.barbeiro.update({ where: { id, barbeariaId }, data: { ordem: ordemNaPosicao(indice) } });
        }
      });
      return listaDaEquipe(barbeariaId);
    }
  );

  app.post(
    "/equipe",
    // Criar manda o convite: o mesmo orçamento do reenvio.
    { schema: { body: corpoNovoMembro }, onRequest: exigirPapel("dono"), preHandler: limites.convite },
    async (request, reply) => {
      exigirCanalDeEmail(app);

      const { nome, papel, telefone, atende } = request.body;
      // `!`: o schema exige e-mail não vazio, como no signup.
      const email = normalizarEmail(request.body.email)!;

      const { barbeariaId } = request.user;
      let membro;
      try {
        membro = await prisma.$transaction(async (tx) => {
          if (contaNoPlano({ ativo: true, papel })) await garantirVagaNoPlano(tx, barbeariaId, new Date());
          return tx.barbeiro.create({
            data: {
              barbeariaId,
              nome,
              email,
              papel,
              // A recepção não atende por padrão; o dono diz se atende.
              atende: atende ?? papel !== "recepcao",
              ...(telefone !== undefined ? { telefone: normalizarTelefone(telefone) } : {}),
            },
          });
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
      // Com plano pago, a quantidade na Stripe acompanha a equipe.
      await sincronizarQuantidade(app.cobranca, barbeariaId, request.log);

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
      // `cancelarAssinaturas` é confirmação, não coluna: fica fora do update.
      const { telefone, cancelarAssinaturas, ...resto } = request.body;
      const data = {
        ...resto,
        ...(telefone !== undefined ? { telefone: normalizarTelefone(telefone) } : {}),
      };

      // Desativar cancelando as assinaturas: as online são canceladas antes
      // no provedor, fora da transação (é rede). Falhou, nada muda. Se a
      // transação depois recusar (o último dono), o provedor já cancelou,
      // e o webhook cancela aqui também: foi o que a tela confirmou.
      if (request.body.ativo === false && cancelarAssinaturas === true) {
        const online = await prisma.assinaturaDoCliente.findMany({
          where: { barbeariaId, forma: "online", situacao: { not: "cancelada" }, plano: { vendedorId: id } },
          select: ONLINE_A_CANCELAR,
        });
        await cancelarNoProvedor(app.provedores, online);
      }

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

        // Reativar ou tirar da recepção: o membro passa a contar no
        // limite do plano.
        if (request.body.ativo === true || (request.body.papel !== undefined && request.body.papel !== "recepcao")) {
          const atual = await tx.barbeiro.findFirst({
            where: { id, barbeariaId },
            select: { ativo: true, papel: true },
          });
          const depois = { ativo: request.body.ativo ?? atual?.ativo, papel: request.body.papel ?? atual?.papel };
          if (atual && !contaNoPlano(atual) && contaNoPlano(depois)) {
            await garantirVagaNoPlano(tx, barbeariaId, new Date());
          }
        }

        // Desativar quem vende com assinantes vivos (decisão 6 do plano
        // planos-de-assinatura): recusa, ou cancela junto se a tela
        // confirmou. Vale em qualquer plano do BarChop, porque no Grátis
        // as assinaturas do cliente seguem valendo. As online já foram
        // canceladas no provedor, acima.
        if (request.body.ativo === false) {
          const vivas = { barbeariaId, situacao: { not: "cancelada" }, plano: { vendedorId: id } };
          const quantas = await tx.assinaturaDoCliente.count({ where: vivas });
          if (quantas > 0 && cancelarAssinaturas !== true) {
            throw new ErroDeNegocio(
              quantas === 1
                ? "este membro tem 1 assinante nos planos que vende: cancele a assinatura para desativar"
                : `este membro tem ${quantas} assinantes nos planos que vende: cancele as assinaturas para desativar`,
              "assinaturas_ativas"
            );
          }
          if (quantas > 0) {
            await tx.assinaturaDoCliente.updateMany({
              where: vivas,
              data: { situacao: "cancelada", canceladaEm: new Date() },
            });
          }
        }

        // barbeariaId no MESMO where da escrita: membro de outra
        // barbearia vira P2025, que o tratador central devolve como 404.
        return tx.barbeiro.update({ where: { id, barbeariaId }, data });
      });

      // Reativar, desativar ou trocar de papel muda a conta do plano.
      await sincronizarQuantidade(app.cobranca, barbeariaId, request.log);
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

      // Uma aba aberta com a web de antes das várias pausas manda a pausa
      // única, que a API não entende mais: as `pausas` que vêm junto são
      // as do GET dela, talvez velhas. Gravar apagaria as que outra aba pôs
      // depois. A web antiga mostra a mensagem como veio.
      if (request.body.jornada.some((dia) => dia.pausaInicio !== undefined || dia.pausaFim !== undefined)) {
        throw new ErroDeNegocio(
          "Esta página está desatualizada. Recarregue para salvar a jornada.",
          "recarregue_a_pagina"
        );
      }

      // O id da linha de cada dia, pra gravar as pausas.
      const linhas = await prisma.jornadaProfissional.findMany({
        where: { barbeiroId: id },
        select: { id: true, diaSemana: true },
      });
      const jornadaDo = (diaSemana: number) => {
        const linha = linhas.find((dia) => dia.diaSemana === diaSemana);
        if (!linha) throw new Error(`jornada sem a linha do dia ${diaSemana}`);
        return linha.id;
      };

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
        const pausas = pausasDoDia(dia);
        if (dia.modo !== "proprio") {
          return { diaSemana: dia.diaSemana, modo: dia.modo, horaInicio: null, horaFim: null, pausas };
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
          pausas,
        };
      });

      // Update e não upsert: as sete linhas existem desde o insert do
      // membro (trigger da migration 20261004120000). Os updates vêm
      // primeiro de propósito: travam as sete linhas, e um PUT ao mesmo
      // tempo espera este terminar antes de apagar as pausas (senão os
      // dois apagariam só as de antes e somariam as suas).
      await prisma.$transaction([
        ...dias.map(({ diaSemana, pausas: _pausas, ...resto }) =>
          prisma.jornadaProfissional.update({
            where: { barbeiroId_diaSemana: { barbeiroId: id, diaSemana } },
            data: resto,
          })
        ),
        prisma.pausaDaJornada.deleteMany({ where: { jornada: { barbeiroId: id } } }),
        prisma.pausaDaJornada.createMany({
          data: dias.flatMap(({ diaSemana, pausas }) =>
            pausas.map((pausa) => ({
              jornadaId: jornadaDo(diaSemana),
              horaInicio: horaParaDate(pausa.inicio),
              horaFim: horaParaDate(pausa.fim),
            }))
          ),
        }),
      ]);

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
    { schema: { params: paramsComId }, onRequest: exigirPapel("dono"), preHandler: limites.convite },
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
