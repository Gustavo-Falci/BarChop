import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { decodificarPayload } from "../helpers/decodificar-token";

describe("tipo do token", () => {
  it("o token do signup carrega tipo barbeiro", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    expect(decodificarPayload(token).tipo).toBe("barbeiro");
  });

  it("recusa um token de tipo cliente numa rota de barbeiro", async () => {
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);

    // app.jwt só existe depois do ready: quem registra o plugin é o
    // buildApp, e o registro do Fastify é assíncrono.
    await app.ready();

    const tokenDeCliente = app.jwt.sign({
      tipo: "cliente",
      clienteId: "00000000-0000-4000-8000-000000000000",
      barbeariaId,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(tokenDeCliente),
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
  });

  it("recusa um token antigo, emitido sem tipo", async () => {
    const app = buildApp();
    const { barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    await app.ready();

    // O `as never` é o ponto do teste: este payload não é mais válido
    // pelo tipo, e o que se mede é o que acontece com um token que já
    // estava na mão de alguém quando a fase subiu.
    const tokenAntigo = app.jwt.sign({ barbeiroId, barbeariaId } as never);

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(tokenAntigo),
    });

    expect(resposta.statusCode).toBe(401);
  });

  it("recusa um token de barbeiro numa rota de cliente", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(token),
    });

    // É este caso, mais o inverso lá em cima, que sustenta a escolha de
    // um segredo de JWT só: sem os dois, a separação entre as duas
    // identidades seria confiança, não prova.
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
  });
});
