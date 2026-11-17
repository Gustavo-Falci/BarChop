import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O layout de /[slug] lê o caminho que o navegador pediu pelo cabeçalho
// do proxy; aqui o cabeçalho e a API são de mentira.
const cabecalhos = new Headers();
vi.mock("next/headers", () => ({ headers: async () => cabecalhos }));
vi.mock("../../src/fluxo/metadataDaBarbearia", () => ({
  metadataDaBarbearia: async () => ({ title: "GR Barber" }),
}));

import { generateMetadata } from "../../app/(publico)/[slug]/layout";
import { CABECALHO_DO_CAMINHO } from "../../src/tenant/rota";

const params = Promise.resolve({ slug: "gr-barber" });

// Toda tela do fluxo herda o metadata do layout: o canonical sai daqui,
// junto do título da barbearia.
describe("metadata do layout da barbearia", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cabecalhos.delete(CABECALHO_DO_CAMINHO);
  });

  it("aponta o canonical pro caminho pedido, no host da barbearia", async () => {
    cabecalhos.set(CABECALHO_DO_CAMINHO, "/agendar?servicos=s1");

    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe("GR Barber");
    expect(metadata.alternates?.canonical).toBe("https://gr-barber.barchop.com.br/agendar");
  });

  it("sem o site configurado, sai sem canonical", async () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "");
    cabecalhos.set(CABECALHO_DO_CAMINHO, "/gr-barber");

    const metadata = await generateMetadata({ params });

    expect(metadata.alternates).toBeUndefined();
  });
});
