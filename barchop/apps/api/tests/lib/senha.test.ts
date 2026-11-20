import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  conferirSenha,
  CUSTO_DE_PRODUCAO,
  gerarHashSenha,
  precisaRegravar,
} from "../../src/lib/senha";

// O formato de antes de 15/11: sem os parâmetros no texto, com o custo
// padrão do Node (N=2^14, r=8, p=1). É o que está no banco de produção.
function hashNoFormatoAntigo(senha: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

describe("gerarHashSenha", () => {
  it("leva os parâmetros no texto: scrypt$n=,r=,p=$salt$hash", async () => {
    // Com o custo escrito ao lado do hash, subir o custo de novo no
    // futuro não invalida senha nenhuma: cada hash diz como foi feito.
    const hash = await gerarHashSenha("senha-do-barbeiro", CUSTO_DE_PRODUCAO);
    const partes = hash.split("$");

    expect(partes).toHaveLength(4);
    expect(partes[0]).toBe("scrypt");
    expect(partes[1]).toBe("n=65536,r=8,p=2");
  });

  it("o custo de produção é o recomendado pela OWASP pro scrypt", () => {
    // N=2^16, r=8, p=2 (auditoria de 15/11, SEC-015). O padrão do Node,
    // que valia antes, é N=2^14 com p=1: oito vezes mais barato de
    // quebrar depois de um vazamento do banco.
    expect(CUSTO_DE_PRODUCAO).toEqual({ n: 65536, r: 8, p: 2 });
  });

  it("gera hash diferente pra mesma senha, por causa do salt", async () => {
    const a = await gerarHashSenha("mesma-senha");
    const b = await gerarHashSenha("mesma-senha");

    expect(a).not.toBe(b);
  });
});

describe("conferirSenha", () => {
  it("aceita a senha correta", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    expect(await conferirSenha("senha-do-barbeiro", hash)).toBe(true);
  });

  it("recusa a senha errada", async () => {
    const hash = await gerarHashSenha("senha-do-barbeiro");
    expect(await conferirSenha("outra-senha", hash)).toBe(false);
  });

  it("confere com o custo que está escrito no hash, não com o do momento", async () => {
    const caro = await gerarHashSenha("senha-do-barbeiro", CUSTO_DE_PRODUCAO);
    const barato = await gerarHashSenha("senha-do-barbeiro", { n: 1024, r: 8, p: 1 });

    expect(await conferirSenha("senha-do-barbeiro", caro)).toBe(true);
    expect(await conferirSenha("senha-do-barbeiro", barato)).toBe(true);
    expect(await conferirSenha("outra-senha", caro)).toBe(false);
  });

  it("continua aceitando o hash antigo, sem parâmetros no texto", async () => {
    // Ninguém perde a senha no deploy.
    const antigo = hashNoFormatoAntigo("senha-do-barbeiro");

    expect(await conferirSenha("senha-do-barbeiro", antigo)).toBe(true);
    expect(await conferirSenha("outra-senha", antigo)).toBe(false);
  });

  it("recusa hash malformado sem estourar", async () => {
    expect(await conferirSenha("qualquer", "nao-e-um-hash")).toBe(false);
    expect(await conferirSenha("qualquer", "scrypt$soh-duas-partes")).toBe(false);
    expect(await conferirSenha("qualquer", "bcrypt$c2FsdA==$aGFzaA==")).toBe(false);
  });

  it("recusa parâmetros absurdos sem derivar nada", async () => {
    // Um hash adulterado no banco não pode virar um pedido de gigabytes
    // de memória a cada login.
    const hash = Buffer.alloc(64).toString("base64");
    const salt = Buffer.alloc(16).toString("base64");

    for (const parametros of ["n=1073741824,r=8,p=1", "n=1000,r=8,p=1", "n=65536,r=0,p=1", "n=65536,r=8", "lixo"]) {
      expect(await conferirSenha("qualquer", `scrypt$${parametros}$${salt}$${hash}`)).toBe(false);
    }
  });
});

describe("precisaRegravar", () => {
  it("o hash antigo precisa; o do custo atual, não", async () => {
    const atual = await gerarHashSenha("senha-do-barbeiro", CUSTO_DE_PRODUCAO);

    expect(precisaRegravar(hashNoFormatoAntigo("senha-do-barbeiro"), CUSTO_DE_PRODUCAO)).toBe(true);
    expect(precisaRegravar(atual, CUSTO_DE_PRODUCAO)).toBe(false);
  });

  it("hash mais barato que o custo atual precisa; mais caro, não", async () => {
    const barato = await gerarHashSenha("x", { n: 16384, r: 8, p: 1 });
    const caro = await gerarHashSenha("x", { n: 131072, r: 8, p: 2 });

    expect(precisaRegravar(barato, CUSTO_DE_PRODUCAO)).toBe(true);
    expect(precisaRegravar(caro, CUSTO_DE_PRODUCAO)).toBe(false);
  });
});
