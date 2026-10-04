import { describe, expect, it } from "vitest";
import { enderecoDasBarbearias } from "../../src/lib/endereco";

// Onde mora a página pública de cada barbearia. Em produção cada uma tem
// o próprio host (`<slug>.barchop.com.br`, ADR-0002); em desenvolvimento,
// sem a variável, ela continua no caminho `/<slug>` do mesmo host do
// painel. Quem usa: o link do lembrete, no e-mail e no WhatsApp.
describe("enderecoDasBarbearias", () => {
  it("com URL_DAS_BARBEARIAS, cada barbearia no próprio host", () => {
    const endereco = enderecoDasBarbearias({
      URL_DAS_BARBEARIAS: "https://{slug}.barchop.com.br/",
    })!;

    expect(endereco("gr-barber")).toBe("https://gr-barber.barchop.com.br");
  });

  it("sem ela, cai no caminho dentro do host do painel", () => {
    const endereco = enderecoDasBarbearias({ URL_DO_PAINEL: "http://localhost:3000/" })!;

    expect(endereco("gr-barber")).toBe("http://localhost:3000/gr-barber");
  });

  it("a das barbearias ganha da do painel", () => {
    const endereco = enderecoDasBarbearias({
      URL_DAS_BARBEARIAS: "http://{slug}.localhost:3000",
      URL_DO_PAINEL: "http://localhost:3000",
    })!;

    expect(endereco("gr-barber")).toBe("http://gr-barber.localhost:3000");
  });

  it("variável vazia conta como ausente", () => {
    expect(enderecoDasBarbearias({ URL_DAS_BARBEARIAS: "", URL_DO_PAINEL: "" })).toBeUndefined();
  });

  it("sem nenhuma das duas, não há endereço", () => {
    expect(enderecoDasBarbearias({})).toBeUndefined();
  });

  it("recusa URL_DAS_BARBEARIAS sem o {slug}: todo link iria pra mesma barbearia", () => {
    expect(() =>
      enderecoDasBarbearias({ URL_DAS_BARBEARIAS: "https://barchop.com.br" })
    ).toThrow(/\{slug\}/);
  });
});
