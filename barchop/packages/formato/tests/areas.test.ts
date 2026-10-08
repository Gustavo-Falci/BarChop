import { describe, expect, it } from "vitest";
import { AREAS_DE_CONFIGURACAO, areasTocadas, juntarAreas } from "../src/areas";

// Painel v2, marco 2: qual área das Configurações cada campo salvo
// decide. A API e o dublê do api-client usam esta mesma tabela — se
// divergissem, a tela testada contra o dublê mostraria uma contagem que
// a API de verdade não dá.

describe("áreas das Configurações", () => {
  it("ordem do índice: Horários, Regras de agendamento, Dados do negócio, Comunicação, Notificações", () => {
    expect(AREAS_DE_CONFIGURACAO).toEqual([
      "horarios",
      "regras_de_agendamento",
      "dados_do_negocio",
      "comunicacao",
      "notificacoes",
    ]);
  });

  it.each([
    ["nome", "dados_do_negocio"],
    ["endereco", "dados_do_negocio"],
    ["sobre", "dados_do_negocio"],
    ["logoFormato", "dados_do_negocio"],
    ["comodidades", "dados_do_negocio"],
    ["formasDePagamento", "dados_do_negocio"],
    ["telefone", "comunicacao"],
    ["whatsapp", "comunicacao"],
    ["instagram", "comunicacao"],
    ["lembreteAtivo", "notificacoes"],
    ["lembreteAntecedenciaHoras", "notificacoes"],
    ["intervaloMinutos", "regras_de_agendamento"],
    ["antecedenciaMinutos", "regras_de_agendamento"],
    ["aceitaMesmoDia", "regras_de_agendamento"],
    ["janelaDias", "regras_de_agendamento"],
    ["cabeAntesDeFechar", "regras_de_agendamento"],
    ["prazoRemarcarHoras", "regras_de_agendamento"],
    ["prazoCancelarHoras", "regras_de_agendamento"],
  ])("o campo %s decide %s", (campo, area) => {
    expect(areasTocadas({ [campo]: null })).toEqual([area]);
  });

  it("campo desconhecido não decide nada", () => {
    expect(areasTocadas({ outro: 1 })).toEqual([]);
  });

  it("vários campos: cada área uma vez, na ordem do índice", () => {
    expect(areasTocadas({ whatsapp: "1", sobre: "x", telefone: "2", lembreteAtivo: true })).toEqual([
      "dados_do_negocio",
      "comunicacao",
      "notificacoes",
    ]);
  });

  it("juntar não repete e devolve na ordem do índice", () => {
    expect(juntarAreas(["notificacoes", "comunicacao"], ["comunicacao", "horarios"])).toEqual([
      "horarios",
      "comunicacao",
      "notificacoes",
    ]);
  });

  it("juntar descarta o que não é área (valor velho no banco)", () => {
    expect(juntarAreas(["regras_antigas", "horarios"], [])).toEqual(["horarios"]);
  });
});
