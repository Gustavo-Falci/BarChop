import { prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import type { ClienteDaLista } from "@barchop/types";
import { dateParaData } from "../lib/horas";
import { PADRAO_EMAIL, PADRAO_TELEFONE, PADRAO_UUID } from "../lib/padroes";
import { serializarAgendamento, serializarCliente } from "../lib/serializar";
import {
  apenasDigitos,
  normalizarTelefoneObrigatorio,
} from "../lib/telefone";
import type { App } from "../tipos";

const corpoNovoCliente = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "telefone"],
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    email: { type: ["string", "null"], pattern: PADRAO_EMAIL, maxLength: 160 },
  },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const corpoPatchCliente = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
    email: { type: ["string", "null"], pattern: PADRAO_EMAIL, maxLength: 160 },
  },
} as const;

// O teto de segurança de antes era um `take: 200` fixo e mudo: com 260
// clientes, os 60 do fim do alfabeto simplesmente não existiam pra tela,
// sem paginação e sem aviso. Agora o tamanho é da chamada, o `total`
// acompanha a resposta e quem quer o resto pede a próxima página.
//
// 100 e não 50 porque a linha da tabela tem 65px: uma página de 50 dá
// sete telas de rolagem e faria o barbeiro apertar "carregar mais" o
// tempo todo. 200 continua sendo o teto — é limite de resposta, não
// limite de carteira.
const LIMITE_PADRAO = 100;

const buscaClientes = {
  type: "object",
  additionalProperties: false,
  properties: {
    busca: { type: "string", minLength: 1, maxLength: 120 },
    // O id do último cliente da página anterior.
    cursor: { type: "string", pattern: PADRAO_UUID },
    limite: { type: "integer", minimum: 1, maximum: 200 },
  },
} as const;

// A data do último agendamento de cada cliente da página, numa
// agregação só. Antes a lista do painel descobria isto baixando os
// agendamentos de 90 dias — com cliente e serviços aninhados em cada
// registro — e jogando fora tudo menos a maior data por pessoa. O custo
// daquilo crescia com o MOVIMENTO da barbearia, não com o número de
// clientes, então uma barbearia pequena e cheia já pagava caro.
//
// Sem janela de tempo, de propósito: `MAX(data)` no banco custa o mesmo
// com ou sem corte (o índice [clienteId] já existe), e a data inteira é
// informação melhor. Quem decide o que é "sumido" é a tela, que sabe
// que dia é hoje — a API não precisa de relógio pra responder isto.
async function comUltimoAgendamento(
  clientes: Parameters<typeof serializarCliente>[0][] & { id: string }[],
  barbeariaId: string
): Promise<ClienteDaLista[]> {
  const ids = clientes.map((cliente) => cliente.id);

  // `groupBy` com lista vazia no `in` é consulta garantidamente sem
  // linhas: vale pular a ida ao banco.
  const ultimos = ids.length
    ? await prisma.agendamento.groupBy({
        by: ["clienteId"],
        // O barbeariaId entra junto do `in` por hábito e não por
        // necessidade: os ids já saíram de uma consulta filtrada por
        // ele. Fica porque é o filtro que nunca pode faltar numa
        // consulta de agendamento, e uma exceção "porque aqui dá na
        // mesma" é como a primeira sem ele acaba entrando.
        where: { barbeariaId, clienteId: { in: ids } },
        _max: { data: true },
      })
    : [];

  const porCliente = new Map(
    ultimos.map((linha) => [linha.clienteId, linha._max.data])
  );

  return clientes.map((cliente) => {
    const ultimo = porCliente.get(cliente.id);
    return {
      ...serializarCliente(cliente),
      ultimoAgendamento: ultimo ? dateParaData(ultimo) : null,
    };
  });
}

export function registrarRotasClientes(app: App): void {
  app.get(
    "/clientes",
    { schema: { querystring: buscaClientes } },
    async (request) => {
      const busca = request.query.busca?.trim();
      const digitos = busca ? apenasDigitos(busca) : "";

      // A coluna guarda o telefone pontuado — "(11) 99999-8888" — então
      // procurar "999998888" cru com `contains` nunca casaria. O
      // regexp_replace tira a pontuação do lado do banco, e a busca
      // compara dígito com dígito: qualquer jeito de digitar o número
      // acha o mesmo cliente. Vai em SQL porque o Prisma não expressa
      // função sobre coluna dentro de um `where`.
      //
      // O `LIMIT 200` aqui limita o PRÉ-FILTRO de ids, não a página:
      // esta consulta só alimenta o `id: { in: ... }` abaixo, e um
      // pedaço de telefone que case com mais de 200 cadastros já não é
      // busca, é a lista inteira. A paginação de verdade é a de baixo.
      const porTelefone = digitos
        ? await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM cliente
            WHERE barbearia_id = ${request.user.barbeariaId}::uuid
              AND regexp_replace(telefone, '[^0-9]', '', 'g') LIKE ${`%${digitos}%`}
            LIMIT 200
          `
        : [];

      const limite = request.query.limite ?? LIMITE_PADRAO;
      const cursor = request.query.cursor;

      const onde = {
        // Sempre o barbeariaId do token. É o filtro que faz a agenda
        // de clientes de uma barbearia ser invisível pras outras.
        barbeariaId: request.user.barbeariaId,
        ...(busca
          ? {
              OR: [
                // `mode: "insensitive"` só existe no conector do
                // Postgres — é o que faz "jo" achar "João".
                { nome: { contains: busca, mode: "insensitive" as const } },
                { id: { in: porTelefone.map((linha) => linha.id) } },
              ],
            }
          : {}),
      };

      // `count` com o MESMO `onde` da página: o total precisa falar do
      // que a busca selecionou, senão "3 de 260" apareceria numa busca
      // que achou três pessoas.
      const [total, pagina] = await Promise.all([
        prisma.cliente.count({ where: onde }),
        prisma.cliente.findMany({
          where: onde,
          // O `id` como segundo critério não é enfeite: `nome` não é
          // único, e o cursor do Prisma precisa de uma ordem total pra
          // não pular nem repetir dois "João Silva" na virada da página.
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          // Um a mais do que cabe na página: se ele vier, é porque há
          // próxima. Sem isso, uma carteira de exatamente 100 devolveria
          // um cursor que só serve pra buscar uma página vazia.
          take: limite + 1,
        }),
      ]);

      const temMais = pagina.length > limite;
      const clientes = temMais ? pagina.slice(0, limite) : pagina;

      return {
        clientes: await comUltimoAgendamento(clientes, request.user.barbeariaId),
        total,
        proximoCursor: temMais ? clientes[clientes.length - 1].id : null,
      };
    }
  );

  app.post(
    "/clientes",
    { schema: { body: corpoNovoCliente } },
    async (request, reply) => {
      const { nome, telefone, email } = request.body;

      // Telefone repetido na mesma barbearia bate no unique
      // [barbeariaId, telefone] e vira P2002 -> 409 pelo tratador
      // central. Em barbearias diferentes passa, de propósito.
      const cliente = await prisma.cliente.create({
        data: {
          barbeariaId: request.user.barbeariaId,
          nome,
          telefone: normalizarTelefoneObrigatorio(telefone),
          email: normalizarEmail(email),
        },
      });

      return reply.code(201).send(serializarCliente(cliente));
    }
  );

  app.get(
    "/clientes/:id",
    { schema: { params: paramsComId } },
    async (request) => {
      const barbeariaId = request.user.barbeariaId;

      // findFirstOrThrow e não findUnique: o filtro por barbearia entra
      // na mesma consulta, e "cliente de outra barbearia" cai no mesmo
      // P2025 que "cliente que não existe" — 404 nos dois casos, de
      // propósito.
      const cliente = await prisma.cliente.findFirstOrThrow({
        where: { id: request.params.id, barbeariaId },
        include: {
          agendamentos: {
            // Redundante hoje, já que o cliente pertence a uma barbearia
            // só. Fica porque é barato e porque o dia em que um cliente
            // circular entre barbearias, o histórico não vaza junto.
            where: { barbeariaId },
            orderBy: [{ data: "desc" }, { horaInicio: "desc" }],
            take: 50,
            include: {
              servicos: { include: { servico: { select: { nome: true } } } },
              barbeiro: { select: { id: true, nome: true } },
            },
          },
        },
      });

      return {
        ...serializarCliente(cliente),
        agendamentos: cliente.agendamentos.map(serializarAgendamento),
      };
    }
  );

  app.patch(
    "/clientes/:id",
    { schema: { params: paramsComId, body: corpoPatchCliente } },
    async (request) => {
      const { nome, telefone, email } = request.body;

      const cliente = await prisma.cliente.update({
        // barbeariaId no mesmo where da escrita: cliente de outra
        // barbearia vira P2025 -> 404, nunca uma edição silenciosa.
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        data: {
          ...(nome !== undefined ? { nome } : {}),
          // Mesmo tratamento do email: só entra no `data` quando veio no
          // corpo, e sempre normalizado — os dois escrevem numa coluna
          // que faz parte de uma chave única.
          // `Obrigatorio` e não o normalizarTelefone puro: diferente da
          // barbearia e do barbeiro, `Cliente.telefone` é NOT NULL no
          // schema, e o corpo desta rota não aceita null — quem entrega
          // isso ao compilador é o retorno `string` do wrapper.
          ...(telefone !== undefined
            ? { telefone: normalizarTelefoneObrigatorio(telefone) }
            : {}),
          // `email` tem tratamento próprio porque passa pela
          // normalização — e porque `null` aqui significa "limpar", não
          // "não mexer".
          ...(email !== undefined ? { email: normalizarEmail(email) } : {}),
        },
      });

      return serializarCliente(cliente);
    }
  );
}
