import { describe, expect, it, vi } from "vitest";
import {
  CODIGO_DO_CONVITE_FALSO,
  criarApiClient,
  criarApiClientFalso,
  ErroDaApi,
} from "../src/index";

// Onda 1, A5: a equipe no client. As rotas são as de
// apps/api/src/routers/equipe.ts e o aceite de routers/auth.ts.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-dono",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function chamada(fetchFalso: ReturnType<typeof vi.fn>) {
  const init = fetchFalso.mock.calls[0][1] as RequestInit;
  return {
    url: fetchFalso.mock.calls[0][0] as string,
    metodo: init.method,
    corpo: init.body === undefined ? undefined : JSON.parse(init.body as string),
    token: (init.headers as Record<string, string>).Authorization,
  };
}

const ANA = {
  id: "m2",
  nome: "Ana",
  email: "ana@exemplo.com",
  telefone: null,
  papel: "profissional",
  atende: true,
  ativo: true,
  fotoUrl: null,
  convitePendente: true,
};

describe("api da equipe", () => {
  it("lista a equipe com token e devolve só a lista", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ membros: [ANA] }));

    const membros = await client(fetchFalso).barbeiro.equipe();

    expect(chamada(fetchFalso)).toMatchObject({
      url: "https://api.exemplo.br/equipe",
      metodo: "GET",
      token: "Bearer jwt-do-dono",
    });
    expect(membros).toEqual([ANA]);
  });

  it("convida com POST /equipe", async () => {
    const fetchFalso = vi.fn(async () => respostaJson(ANA, 201));

    await client(fetchFalso).barbeiro.convidarMembro({
      nome: "Ana",
      email: "ana@exemplo.com",
      papel: "profissional",
    });

    expect(chamada(fetchFalso)).toMatchObject({
      url: "https://api.exemplo.br/equipe",
      metodo: "POST",
      corpo: { nome: "Ana", email: "ana@exemplo.com", papel: "profissional" },
      token: "Bearer jwt-do-dono",
    });
  });

  it("edita com PATCH /equipe/:id", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ ...ANA, papel: "recepcao" }));

    await client(fetchFalso).barbeiro.atualizarMembro("m2", { papel: "recepcao" });

    expect(chamada(fetchFalso)).toMatchObject({
      url: "https://api.exemplo.br/equipe/m2",
      metodo: "PATCH",
      corpo: { papel: "recepcao" },
    });
  });

  it("reenvia o convite sem corpo — com content-type e corpo vazio a API dá 400", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ enviado: true }, 202));

    await client(fetchFalso).barbeiro.reenviarConvite("m2");

    const feita = chamada(fetchFalso);
    expect(feita).toMatchObject({
      url: "https://api.exemplo.br/equipe/m2/convite",
      metodo: "POST",
      corpo: undefined,
    });
  });

  it("aceita o convite sem token e devolve a sessão", async () => {
    const sessao = {
      token: "jwt-da-ana",
      barbeiro: { id: "m2", nome: "Ana", email: "ana@exemplo.com", papel: "profissional" },
      barbearia: { id: "b1", nome: "GR Barber", slug: "gr-barber" },
    };
    const fetchFalso = vi.fn(async () => respostaJson(sessao));

    const devolvida = await client(fetchFalso).barbeiro.aceitarConvite({
      email: "ana@exemplo.com",
      codigo: "123456",
      senha: "senha-forte-123",
    });

    expect(chamada(fetchFalso)).toMatchObject({
      url: "https://api.exemplo.br/auth/convite/aceitar",
      metodo: "POST",
      token: undefined,
    });
    expect(devolvida.token).toBe("jwt-da-ana");
  });
});

// O dublê segue as regras da API. Um dublê que aceitasse o que a API
// recusa deixaria a tela sem ramo pros erros — já aconteceu no login.
describe("dublê — equipe", () => {
  it("o perfil é do dono por padrão, e o papel é semeável", async () => {
    expect((await criarApiClientFalso().barbeiro.meuPerfil()).papel).toBe("dono");

    const recepcao = criarApiClientFalso({ papel: "recepcao" });
    const perfil = await recepcao.barbeiro.meuPerfil();
    expect(perfil).toMatchObject({ papel: "recepcao", atende: false });
    expect((await recepcao.barbeiro.atualizarMeuPerfil({ nome: "Bia" })).papel).toBe("recepcao");
  });

  it("a equipe começa com o dono, e o convidado entra pendente", async () => {
    const falso = criarApiClientFalso();

    const ana = await falso.barbeiro.convidarMembro({
      nome: "Ana",
      email: "ana@exemplo.com",
      papel: "profissional",
    });
    const membros = await falso.barbeiro.equipe();

    expect(membros.map((m) => m.papel)).toEqual(["dono", "profissional"]);
    expect(ana).toMatchObject({ convitePendente: true, atende: true, ativo: true });
  });

  it("recepção nasce sem atender", async () => {
    const falso = criarApiClientFalso();

    const bia = await falso.barbeiro.convidarMembro({
      nome: "Bia",
      email: "bia@exemplo.com",
      papel: "recepcao",
    });

    expect(bia.atende).toBe(false);
  });

  it("e-mail repetido: 409 email_em_uso", async () => {
    const falso = criarApiClientFalso();
    const dono = (await falso.barbeiro.equipe())[0];

    await expect(
      falso.barbeiro.convidarMembro({ nome: "X", email: dono.email!, papel: "profissional" })
    ).rejects.toMatchObject({ status: 409, codigo: "email_em_uso" });
  });

  it("o último dono não se rebaixa; convidado pendente não conta como dono", async () => {
    const falso = criarApiClientFalso();
    const dono = (await falso.barbeiro.equipe())[0];
    await falso.barbeiro.convidarMembro({ nome: "Co", email: "co@exemplo.com", papel: "dono" });

    const tentativa = falso.barbeiro.atualizarMembro(dono.id, { papel: "profissional" });

    await expect(tentativa).rejects.toBeInstanceOf(ErroDaApi);
    await expect(tentativa).rejects.toMatchObject({ status: 422, codigo: "ultimo_dono" });
  });

  it("reenviar convite pra quem já entrou: 422 convite_desnecessario", async () => {
    const falso = criarApiClientFalso();
    const dono = (await falso.barbeiro.equipe())[0];

    await expect(falso.barbeiro.reenviarConvite(dono.id)).rejects.toMatchObject({
      status: 422,
      codigo: "convite_desnecessario",
    });
  });

  it("aceita o convite só com o código do dublê, e o convite deixa de estar pendente", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.convidarMembro({ nome: "Ana", email: "ana@exemplo.com", papel: "profissional" });

    await expect(
      falso.barbeiro.aceitarConvite({ email: "ana@exemplo.com", codigo: "000000", senha: "senha-forte-123" })
    ).rejects.toMatchObject({ status: 422, codigo: "codigo_invalido" });

    const sessao = await falso.barbeiro.aceitarConvite({
      email: "ana@exemplo.com",
      codigo: CODIGO_DO_CONVITE_FALSO,
      senha: "senha-forte-123",
    });

    expect(sessao.barbeiro.nome).toBe("Ana");
    const ana = (await falso.barbeiro.equipe()).find((m) => m.nome === "Ana");
    expect(ana?.convitePendente).toBe(false);
  });
});
