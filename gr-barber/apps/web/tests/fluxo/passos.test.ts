import { describe, expect, it } from "vitest";
import {
  caminhoDoLogin,
  caminhoDoPasso,
  ehPasso,
  lerEscolhas,
  passoDoVoltar,
  montarQuery,
} from "../../src/fluxo/passos";

describe("escolhas na query", () => {
  it("lê a lista de serviços separada por vírgula", () => {
    const escolhas = lerEscolhas(
      new URLSearchParams({ servicos: "s1,s2", data: "2026-09-09" })
    );
    expect(escolhas.servicoIds).toEqual(["s1", "s2"]);
    expect(escolhas.data).toBe("2026-09-09");
    expect(escolhas.hora).toBeUndefined();
  });

  it("devolve lista vazia quando não há serviço nenhum", () => {
    expect(lerEscolhas(new URLSearchParams()).servicoIds).toEqual([]);
  });

  it("ignora vírgula solta em vez de produzir id vazio", () => {
    // Um id vazio viraria ?servicoIds= na chamada e a API responderia
    // 400 por causa do pattern de uuid.
    expect(lerEscolhas(new URLSearchParams({ servicos: "s1,," })).servicoIds).toEqual(
      ["s1"]
    );
  });

  it("monta a query de volta na mesma ordem", () => {
    expect(
      montarQuery({ servicoIds: ["s1", "s2"], data: "2026-09-09", hora: "09:30" })
    ).toBe("?servicos=s1%2Cs2&data=2026-09-09&hora=09%3A30");
  });

  it("carrega o remarcar quando ele existe", () => {
    const escolhas = lerEscolhas(new URLSearchParams({ remarcar: "a1" }));
    expect(escolhas.remarcar).toBe("a1");
    expect(montarQuery(escolhas)).toBe("?remarcar=a1");
  });

  it("o aviso sobrevive à ida e volta entre lerEscolhas e montarQuery", () => {
    // O aviso é como a confirmação avisa a tela de horário sem estado
    // local: precisa ir e voltar intacto, e por último na query pra não
    // deslocar os campos que os outros testes já fixam.
    const escolhas = lerEscolhas(
      new URLSearchParams({ servicos: "s1", data: "2026-09-09", aviso: "horario_ocupado" })
    );
    expect(escolhas.aviso).toBe("horario_ocupado");
    expect(montarQuery(escolhas)).toBe(
      "?servicos=s1&data=2026-09-09&aviso=horario_ocupado"
    );
  });

  it("não inclui aviso quando ele não existe", () => {
    expect(lerEscolhas(new URLSearchParams()).aviso).toBeUndefined();
    expect(montarQuery({ servicoIds: [] })).toBe("");
  });

  it("monta o caminho de cada passo com o que já foi escolhido", () => {
    const escolhas = { servicoIds: ["s1"], data: "2026-09-09" };
    expect(caminhoDoPasso("gr-barber", "data", escolhas)).toBe(
      "/gr-barber/agendar/data?servicos=s1&data=2026-09-09"
    );
    expect(caminhoDoPasso("gr-barber", "servicos", escolhas)).toBe(
      "/gr-barber/agendar?servicos=s1&data=2026-09-09"
    );
  });
});

describe("passo de volta depois do login", () => {
  it("aceita os passos que existem e recusa o resto", () => {
    expect(passoDoVoltar("confirmar")).toBe("confirmar");
    expect(passoDoVoltar("//outro-site.com")).toBeNull();
    expect(passoDoVoltar(null)).toBeNull();
  });

  it("'dados' legado vira 'confirmar', em vez de cair no destino padrão", () => {
    // Quem estava no meio do login quando a identificação entrou na
    // confirmação chega com voltar=dados; o destino padrão jogaria fora
    // o agendamento que a pessoa estava fazendo.
    expect(passoDoVoltar("dados")).toBe("confirmar");
  });
});

describe("volta pro fluxo depois de entrar", () => {
  it("leva o passo e as escolhas na query", () => {
    expect(
      caminhoDoLogin("gr-barber", "confirmar", {
        servicoIds: ["s1"],
        data: "2026-09-09",
        hora: "09:00",
      })
    ).toBe("/gr-barber/entrar?servicos=s1&data=2026-09-09&hora=09%3A00&voltar=confirmar");
  });

  it("funciona sem escolha nenhuma na query", () => {
    expect(caminhoDoLogin("gr-barber", "servicos", { servicoIds: [] })).toBe(
      "/gr-barber/entrar?voltar=servicos"
    );
  });

  it("reconhece só os passos que existem", () => {
    expect(ehPasso("data")).toBe(true);
    expect(ehPasso("confirmar")).toBe(true);
    // Viraram parte de outras telas.
    expect(ehPasso("horario")).toBe(false);
    expect(ehPasso("dados")).toBe(false);

    // O ponto do `ehPasso`: é ele que impede um destino vindo de fora
    // de virar navegação. Guardar a URL inteira num parâmetro seria
    // redirecionamento aberto, e validá-la por prefixo não bastaria —
    // estas três passam por quase toda checagem ingênua.
    expect(ehPasso("https://outro-site.com")).toBe(false);
    expect(ehPasso("//outro-site.com")).toBe(false);
    expect(ehPasso("/gr-barber/../../outro")).toBe(false);

    expect(ehPasso("")).toBe(false);
    expect(ehPasso(null)).toBe(false);
    expect(ehPasso(undefined)).toBe(false);
    // Não pode casar com o que vem do Object.prototype.
    expect(ehPasso("toString")).toBe(false);
    expect(ehPasso("constructor")).toBe(false);
  });
});
