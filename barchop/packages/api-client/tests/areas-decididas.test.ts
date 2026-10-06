import { describe, expect, it } from "vitest";
import { criarApiClientFalso } from "../src/index";

// O dublê marca as áreas decididas como a API (painel v2, marco 2): a
// tela de Configurações é testada contra ele, e a contagem "X de N"
// precisa ser a mesma que a API de verdade daria.

describe("áreas decididas no dublê", () => {
  it("sem semente, nada decidido", async () => {
    const api = criarApiClientFalso();

    expect((await api.barbeiro.minhaBarbearia()).areasDecididas).toEqual([]);
  });

  it("a semente define o que já foi decidido", async () => {
    const api = criarApiClientFalso({ areasDecididas: ["comunicacao"] });

    expect((await api.barbeiro.minhaBarbearia()).areasDecididas).toEqual(["comunicacao"]);
  });

  it("salvar a barbearia decide as áreas dos campos enviados", async () => {
    const api = criarApiClientFalso();

    const salva = await api.barbeiro.atualizarMinhaBarbearia({ whatsapp: "11999998888", sobre: "Desde 2010." });

    expect(salva.areasDecididas).toEqual(["dados_do_negocio", "comunicacao"]);
    expect((await api.barbeiro.minhaBarbearia()).areasDecididas).toEqual(["dados_do_negocio", "comunicacao"]);
  });

  it("salvar os horários decide Horários", async () => {
    const api = criarApiClientFalso();

    await api.barbeiro.salvarHorarios([]);

    expect((await api.barbeiro.minhaBarbearia()).areasDecididas).toEqual(["horarios"]);
  });

  it("enviar a capa decide Dados do negócio", async () => {
    const api = criarApiClientFalso();

    await api.barbeiro.enviarCapa(new Blob(["x"], { type: "image/png" }));

    expect((await api.barbeiro.minhaBarbearia()).areasDecididas).toEqual(["dados_do_negocio"]);
  });
});
