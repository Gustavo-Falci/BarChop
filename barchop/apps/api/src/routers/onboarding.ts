import { prisma } from "@barchop/database";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// A trilha de primeiros passos do dono (Onda 1, F2). Na ordem em que a
// barbearia fica pronta pra receber cliente: quando abre, o que faz, com
// quem, o link no ar, e a prova de que o link funciona — alguém marcou
// sozinho.
const ORDEM = ["horarios", "servicos", "equipe", "link", "primeira_reserva"] as const;
type Passo = (typeof ORDEM)[number];

// Derivado do que existe, menos as duas marcas que não se deduzem (link
// copiado e "trabalho sozinho", migration 20261004190000_onboarding).
// Cinco consultas pequenas e independentes, em paralelo.
async function estadoDaTrilha(barbeariaId: string) {
  const [barbearia, horarios, servicos, membros, reservas] = await Promise.all([
    prisma.barbearia.findUniqueOrThrow({
      where: { id: barbeariaId },
      select: { linkCompartilhadoEm: true, trabalhaSozinho: true },
    }),
    prisma.horarioFuncionamento.count({
      where: { barbeariaId, fechado: false, horaAbertura: { not: null }, horaFechamento: { not: null } },
    }),
    prisma.servico.count({ where: { barbeariaId, ativo: true } }),
    prisma.barbeiro.count({ where: { barbeariaId, ativo: true } }),
    // Só a do cliente: agendamento lançado pelo barbeiro não prova que o
    // link funciona.
    prisma.agendamento.count({ where: { barbeariaId, origem: "cliente" }, take: 1 }),
  ]);

  const feito: Record<Passo, boolean> = {
    horarios: horarios > 0,
    servicos: servicos > 0,
    equipe: membros > 1 || barbearia.trabalhaSozinho,
    link: barbearia.linkCompartilhadoEm !== null,
    primeira_reserva: reservas > 0,
  };

  return {
    passos: ORDEM.map((id) => ({ id, feito: feito[id] })),
    completo: ORDEM.every((id) => feito[id]),
  };
}

const corpoDaTrilha = {
  type: "object",
  required: ["trabalhoSozinho"],
  additionalProperties: false,
  properties: { trabalhoSozinho: { type: "boolean" } },
} as const;

export function registrarRotasOnboarding(app: App): void {
  // Do dono: é ele quem configura a barbearia, e a trilha aponta pra
  // telas que só ele abre (Equipe, Configurações).
  app.get(
    "/barbearias/me/onboarding",
    { onRequest: exigirPapel("dono") },
    async (request) => estadoDaTrilha(request.user.barbeariaId)
  );

  // "Trabalho sozinho" — e o desfazer, pra quem contratou depois ou
  // marcou sem querer. Devolve o estado novo, que é o que a tela redesenha.
  app.patch(
    "/barbearias/me/onboarding",
    { schema: { body: corpoDaTrilha }, onRequest: exigirPapel("dono") },
    async (request) => {
      await prisma.barbearia.update({
        where: { id: request.user.barbeariaId },
        data: { trabalhaSozinho: request.body.trabalhoSozinho },
      });
      return estadoDaTrilha(request.user.barbeariaId);
    }
  );

  // Qualquer um da equipe: quem copia o link e manda pro cliente pode
  // ser o profissional. Guarda a primeira vez — o passo é "já
  // compartilhou", e copiar de novo não muda nada.
  app.post("/barbearias/me/link-copiado", async (request, reply) => {
    await prisma.barbearia.updateMany({
      where: { id: request.user.barbeariaId, linkCompartilhadoEm: null },
      data: { linkCompartilhadoEm: new Date() },
    });
    return reply.code(204).send();
  });
}
