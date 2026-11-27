import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { lotacaoDoLink } from "../../src/lib/agenda-cheia";
import { canalDeMemoria } from "../../src/lib/canal";
import { agoraNaBarbearia, dataParaDate, dateParaData, instanteNaBarbearia } from "../../src/lib/horas";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { diasDaJanela, encher, JANELA_CURTA, prepararJanelaCurta } from "../helpers/agenda";

// A conta da agenda cheia por profissional (plano agenda-cheia-profissional,
// marco 3 do PRD agenda-cheia): a mesma passada que diz se a barbearia
// está cheia diz, de cada profissional do link, se o link ainda oferece
// algum horário dele até o fim da janela.

const UM_DIA = 24 * 60 * 60 * 1000;
const HOJE = agoraNaBarbearia().data;
const ULTIMO = dateParaData(new Date(dataParaDate(HOJE).getTime() + JANELA_CURTA * UM_DIA));
// 8h de São Paulo: antes da hora aberta (9 às 10), nada do dia passou.
const AGORA = agoraNaBarbearia(instanteNaBarbearia(HOJE, "08:00"));
const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

// O dono da agenda de teste e um profissional, os dois no link, os dois
// fazendo o Corte (o banco liga o profissional novo a todos os serviços).
async function doisNoLink() {
  const app = buildApp({ canal: canalDeMemoria() });
  const agenda = await prepararJanelaCurta(app);
  const rafa = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "rafa");
  return { app, agenda, rafaId: rafa.barbeiroId };
}

function lotacao(barbeariaId: string) {
  return lotacaoDoLink(prisma, { barbeariaId, agora: AGORA });
}

describe("lotacaoDoLink", () => {
  it("um cheio e outro livre: só o cheio tem o último dia, e a barbearia não está cheia", async () => {
    const { agenda, rafaId } = await doisNoLink();
    await encher(agenda, { barbeiroId: rafaId });

    const { barbearia, profissionais } = await lotacao(agenda.barbeariaId);

    expect(barbearia).toBeNull();
    expect(profissionais.get(rafaId)).toBe(ULTIMO);
    expect(profissionais.get(agenda.barbeiroId)).toBeNull();
  });

  it("os dois cheios: os dois e a barbearia têm o último dia", async () => {
    const { agenda, rafaId } = await doisNoLink();
    await encher(agenda);
    await encher(agenda, { barbeiroId: rafaId });

    const { barbearia, profissionais } = await lotacao(agenda.barbeariaId);

    expect(barbearia).toBe(ULTIMO);
    expect(profissionais.get(rafaId)).toBe(ULTIMO);
    expect(profissionais.get(agenda.barbeiroId)).toBe(ULTIMO);
  });

  it("só com bloqueio, sem agendamento dele no período, o profissional não está cheio", async () => {
    const { agenda, rafaId } = await doisNoLink();
    const dias = diasDaJanela();
    await prisma.bloqueio.create({
      data: {
        barbeariaId: agenda.barbeariaId,
        barbeiroId: rafaId,
        dataInicio: dias[0]!,
        dataFim: dias.at(-1)!,
        horaInicio: hora("09:00"),
        horaFim: hora("10:00"),
      },
    });

    const { profissionais } = await lotacao(agenda.barbeariaId);

    expect(profissionais.get(rafaId)).toBeNull();
  });

  it("um buraco que cabe o serviço mais curto que só ele faz: não está cheio", async () => {
    const { app, agenda, rafaId } = await doisNoLink();
    const sobrancelha = (
      await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(agenda.token),
        payload: { nome: "Sobrancelha", duracaoMinutos: 15, preco: "20.00" },
      })
    ).json();
    // Só o Rafa faz a Sobrancelha.
    await prisma.profissionalServico.deleteMany({
      where: { barbeiroId: agenda.barbeiroId, servicoId: sobrancelha.id },
    });
    // O último dia da janela: 09:45–10:00 livre. Não cabe o Corte de 45
    // min, cabe a Sobrancelha.
    await encher(agenda, { barbeiroId: rafaId, exceto: { dia: diasDaJanela().at(-1)!, ate: "09:45" } });

    const { profissionais } = await lotacao(agenda.barbeariaId);

    expect(profissionais.get(rafaId)).toBeNull();
  });

  it("sem limite de dias, ninguém está cheio", async () => {
    const { agenda, rafaId } = await doisNoLink();
    await encher(agenda);
    await encher(agenda, { barbeiroId: rafaId });
    await prisma.barbearia.update({ where: { id: agenda.barbeariaId }, data: { janelaDias: null } });

    const { barbearia, profissionais } = await lotacao(agenda.barbeariaId);

    expect(barbearia).toBeNull();
    expect(profissionais.get(rafaId) ?? null).toBeNull();
    expect(profissionais.get(agenda.barbeiroId) ?? null).toBeNull();
  });
});
