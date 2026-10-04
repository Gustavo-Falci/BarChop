import { prisma } from "@barchop/database";
import { slugReservado } from "@barchop/formato";
import { PODE_ATENDER } from "../lib/disponibilidade";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { normalizarTelefone } from "../lib/telefone";
import { PADRAO_SLUG, PADRAO_TELEFONE } from "../lib/padroes";
import { serializarBarbearia } from "../lib/serializar";
import { completarSemana } from "./horarios";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// A tela de Configurações edita estes campos. `slug` fica fora: trocar
// o link público quebra o que o barbeiro já mandou no WhatsApp, então
// tem rota própria (PATCH /barbearias/me/slug) e botão próprio na tela,
// em vez de ir de carona num "Salvar dados". `id` e `barbeariaId`
// também ficam fora, e o additionalProperties: false é o que faz um
// corpo com barbeariaId virar 400 em vez de ser ignorado em silêncio.
const corpoPatchBarbearia = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: {
      type: ["string", "null"],
      pattern: PADRAO_TELEFONE,
      maxLength: 20,
    },
    endereco: { type: ["string", "null"], maxLength: 255 },
    // O texto que a home pública mostra. `null` limpa; o limite é o
    // mesmo da coluna, senão o banco recusaria com 500 o que o schema
    // deixou passar.
    //
    // Texto puro, nunca HTML: ele é renderizado como filho de um
    // elemento React, que escapa por padrão. Quem for dar formatação a
    // isso um dia resolve com `white-space: pre-line` no CSS — jamais
    // com dangerouslySetInnerHTML, que transformaria este campo num
    // XSS armazenado servido na página mais pública do produto.
    sobre: { type: ["string", "null"], maxLength: 1000 },
    // Só http(s): o campo vai direto pro `src` de uma imagem nas telas,
    // e um "javascript:" ali seria XSS servido pela nossa API.
    logoUrl: {
      type: ["string", "null"],
      pattern: "^https?://",
      maxLength: 500,
    },
  },
} as const;

const corpoTrocaDeSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: PADRAO_SLUG } },
} as const;

export function registrarRotasBarbeariasProtegidas(app: App): void {
  // A leitura do painel. Antes dela, Configurações lia a própria
  // barbearia pela rota pública por slug — o painel dependia de uma
  // rota aberta pra exibir o que ele mesmo escreve.
  app.get("/barbearias/me", async (request) => {
    const barbearia = await prisma.barbearia.findUniqueOrThrow({
      where: { id: request.user.barbeariaId },
    });

    return serializarBarbearia(barbearia);
  });

  // Trocar o link público. O antigo para de responder na hora: o
  // redirect do slug antigo vem com o tenant por subdomínio (ADR-0002).
  // Slug de outra barbearia cai no unique da coluna → P2002 → 409, sem
  // consulta prévia que abriria corrida entre checar e gravar.
  app.patch(
    "/barbearias/me/slug",
    { schema: { body: corpoTrocaDeSlug }, onRequest: exigirPapel("dono") },
    async (request) => {
      const { slug } = request.body;

      if (slugReservado(slug)) {
        throw new ErroDeNegocio(
          "esse endereço é reservado pelo sistema",
          "slug_reservado"
        );
      }

      const barbearia = await prisma.barbearia.update({
        where: { id: request.user.barbeariaId },
        data: { slug },
      });

      return serializarBarbearia(barbearia);
    }
  );

  app.patch(
    "/barbearias/me",
    { schema: { body: corpoPatchBarbearia }, onRequest: exigirPapel("dono") },
    async (request) => {
      // O id sai do token. Não existe rota `/barbearias/:id` de escrita:
      // sem id na URL não há o que escopar errado.
      // `telefone` sai do corpo pra ser normalizado; o resto vai
      // direto, porque o additionalProperties: false já garantiu que só
      // há campo editável ali.
      const { telefone, ...resto } = request.body;

      const barbearia = await prisma.barbearia.update({
        where: { id: request.user.barbeariaId },
        data: {
          ...resto,
          ...(telefone !== undefined
            ? { telefone: normalizarTelefone(telefone) }
            : {}),
        },
      });

      return serializarBarbearia(barbearia);
    }
  );
}

// Mesmo pattern do slug no signup: é ele que forma o link público, e um
// slug fora do formato não chega nem a consultar o banco.
const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: PADRAO_SLUG } },
} as const;

// Pública de propósito: é a landing que o cliente abre pelo link do
// WhatsApp, sem conta nenhuma. Fica fora do escopo protegido do app.ts.
export function registrarRotasBarbeariasPublicas(app: App): void {
  app.get(
    "/barbearias/:slug",
    { schema: { params: paramsSlug } },
    async (request) => {
      // findUniqueOrThrow: slug inexistente vira P2025, que o tratador
      // central traduz pra 404.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        include: {
          horariosFuncionamento: true,
          // Só id e nome, e só quem atende cliente: ativo, que não é
          // recepção, e que já aceitou o convite (com senha). O select
          // explícito é o que impede o senhaHash de sair numa rota
          // pública — o filtro por ele não o devolve.
          //
          // Ordem de entrada na equipe, não de nome: até o bloco C o
          // fluxo público agenda com o primeiro da lista, e um membro
          // novo com nome em "A" tomaria os agendamentos do dono.
          barbeiros: {
            // O mesmo critério do "qualquer um" (lib/disponibilidade.ts).
            where: PODE_ATENDER,
            select: { id: true, nome: true },
            orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
          },
        },
      });

      // Campos escolhidos pelo serializador: um spread traria o
      // senhaHash junto.
      return {
        ...serializarBarbearia(barbearia),
        horarios: completarSemana(barbearia.horariosFuncionamento),
        // O cliente precisa deste id pra chamar /disponibilidade e pra
        // criar o agendamento; sem ele o fluxo público não fecha.
        barbeiros: barbearia.barbeiros,
      };
    }
  );
}
