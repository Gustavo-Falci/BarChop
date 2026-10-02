import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken, definirSenhaComCodigo } from "../helpers/cliente";
import { decodificarPayload } from "../helpers/decodificar-token";

// Um token "de antes", com `iat` um minuto no passado. Sem isso o teste
// dependeria de a troca de senha cair num segundo diferente da emissão —
// o `iat` do JWT é em segundos.
function umMinutoAtras(): number {
  return Math.floor(Date.now() / 1000) - 60;
}

describe("trocar a senha derruba as sessões abertas", () => {
  it("cliente: token emitido antes do esqueci-a-senha vira 401; o novo vale", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    const { clienteId } = await criarClienteComToken(app, barbearia.slug);

    const iatAntigo = umMinutoAtras();
    const antigo = app.jwt.sign({
      tipo: "cliente",
      clienteId,
      barbeariaId: barbearia.barbeariaId,
      iat: iatAntigo,
    });
    expect(decodificarPayload(antigo).iat).toBe(iatAntigo);

    const troca = await definirSenhaComCodigo(app, barbearia.slug, {
      telefone: "11999998888",
      senha: "outra-senha-456",
    });
    expect(troca.statusCode).toBe(200);
    const novo = troca.json().token as string;

    const comAntigo = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(antigo),
    });
    const comNovo = await app.inject({
      method: "GET",
      url: "/clientes/me",
      headers: auth(novo),
    });

    expect(comAntigo.statusCode).toBe(401);
    expect(comNovo.statusCode).toBe(200);

    await app.close();
  });

  it("barbeiro: token anterior à troca vira 401", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);

    const antigo = app.jwt.sign({
      tipo: "barbeiro",
      barbeiroId: barbearia.barbeiroId,
      barbeariaId: barbearia.barbeariaId,
      iat: umMinutoAtras(),
    });
    await prisma.barbeiro.update({
      where: { id: barbearia.barbeiroId },
      data: { senhaAlteradaEm: new Date() },
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(antigo),
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it("barbeiro: token emitido no mesmo segundo da troca continua valendo", async () => {
    // O token que a própria troca devolve nasce no mesmo segundo do
    // carimbo — recusá-lo deslogaria quem acabou de trocar a senha.
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    await prisma.barbeiro.update({
      where: { id: barbearia.barbeiroId },
      data: { senhaAlteradaEm: new Date() },
    });

    const recemEmitido = app.jwt.sign({
      tipo: "barbeiro",
      barbeiroId: barbearia.barbeiroId,
      barbeariaId: barbearia.barbeariaId,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(recemEmitido),
    });

    expect(resposta.statusCode).toBe(200);

    await app.close();
  });

  it("sem troca registrada, token antigo segue valendo até expirar", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);

    const antigo = app.jwt.sign({
      tipo: "barbeiro",
      barbeiroId: barbearia.barbeiroId,
      barbeariaId: barbearia.barbeariaId,
      iat: umMinutoAtras(),
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(antigo),
    });

    expect(resposta.statusCode).toBe(200);

    await app.close();
  });
});
