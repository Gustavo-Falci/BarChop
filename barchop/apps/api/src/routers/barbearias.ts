import { prisma } from "@barchop/database";
import { COMODIDADES, FORMAS_DE_PAGAMENTO, PADRAO_INSTAGRAM, slugReservado } from "@barchop/formato";
import { PODE_ATENDER } from "../lib/disponibilidade";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { normalizarTelefone } from "../lib/telefone";
import { PADRAO_SLUG, PADRAO_TELEFONE } from "../lib/padroes";
import { serializarBarbearia, serializarBarbeariaDoPainel } from "../lib/serializar";
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
    // Quanto antes do horário sai o lembrete. Mudar não move os que já
    // estão na fila: a antecedência é lida quando o lembrete é agendado.
    lembreteAntecedenciaHoras: { type: "integer", enum: [2, 12, 24] },
    // A página rica (bloco E1). WhatsApp é normalizado como o telefone.
    // Instagram é o @ sem o @, nunca URL: a página monta o link.
    // Comodidades e pagamento são listas fechadas, de @barchop/formato.
    whatsapp: { type: ["string", "null"], pattern: PADRAO_TELEFONE, maxLength: 20 },
    instagram: { type: ["string", "null"], pattern: PADRAO_INSTAGRAM },
    comodidades: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: [...COMODIDADES] },
    },
    formasDePagamento: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: [...FORMAS_DE_PAGAMENTO] },
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

    return serializarBarbeariaDoPainel(barbearia, app.armazenamento.urlPublica);
  });

  // Trocar o link público. O antigo vai pra `slug_antigo` e continua
  // achando a barbearia na rota pública do perfil, de onde o site
  // redireciona (ADR-0002). Slug de outra barbearia cai no unique da
  // coluna → P2002 → 409, sem consulta prévia que abriria corrida entre
  // checar e gravar — e a transação desfaz o antigo gravado junto.
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

      const id = request.user.barbeariaId;
      const barbearia = await prisma.$transaction(async (tx) => {
        const atual = await tx.barbearia.findUniqueOrThrow({ where: { id } });
        if (atual.slug === slug) return atual;

        // O slug atual de qualquer barbearia ganha do antigo: quem pega
        // um slug da tabela o tira de lá — inclusive a própria barbearia
        // voltando ao nome anterior, que senão apontaria pra si mesma.
        await tx.slugAntigo.deleteMany({ where: { slug } });
        await tx.slugAntigo.create({ data: { slug: atual.slug, barbeariaId: id } });
        return tx.barbearia.update({ where: { id }, data: { slug } });
      });

      return serializarBarbeariaDoPainel(barbearia, app.armazenamento.urlPublica);
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
      const { telefone, whatsapp, ...resto } = request.body;

      const barbearia = await prisma.barbearia.update({
        where: { id: request.user.barbeariaId },
        data: {
          ...resto,
          ...(telefone !== undefined
            ? { telefone: normalizarTelefone(telefone) }
            : {}),
          ...(whatsapp !== undefined ? { whatsapp: normalizarTelefone(whatsapp) } : {}),
        },
      });

      return serializarBarbeariaDoPainel(barbearia, app.armazenamento.urlPublica);
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
      // O slug atual ou um que a barbearia já teve: o link antigo
      // circulou, e o `slug` da resposta é o atual — o site compara e
      // redireciona. Os dois nunca acham barbearias diferentes, porque
      // quem pega um slug o tira de `slug_antigo` (PATCH /me/slug e
      // signup).
      //
      // findFirstOrThrow: slug inexistente vira P2025, que o tratador
      // central traduz pra 404.
      const { slug } = request.params;
      const barbearia = await prisma.barbearia.findFirstOrThrow({
        where: { OR: [{ slug }, { slugsAntigos: { some: { slug } } }] },
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
            select: { id: true, nome: true, fotoChave: true, servicos: { select: { servicoId: true } } },
            orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
          },
        },
      });

      // Campos escolhidos pelo serializador: um spread traria o
      // senhaHash junto.
      return {
        ...serializarBarbearia(barbearia, app.armazenamento.urlPublica),
        horarios: completarSemana(barbearia.horariosFuncionamento),
        // O id vai pra disponibilidade e pro agendamento; os serviços de
        // cada um deixam o passo do profissional oferecer só quem faz o
        // que o cliente escolheu.
        barbeiros: barbearia.barbeiros.map((barbeiro) => ({
          id: barbeiro.id,
          nome: barbeiro.nome,
          servicoIds: barbeiro.servicos.map((servico) => servico.servicoId),
          fotoUrl: barbeiro.fotoChave ? app.armazenamento.urlPublica(barbeiro.fotoChave) : null,
        })),
      };
    }
  );
}
