import { describe, expect, it } from "vitest";
import { avisarDaChaveDoPix, type ConfigDoPix } from "../../src/lib/pix";

// O formato da PIX_CHAVE (plano pix-do-barchop, Riscos). O BR Code leva
// a chave como está: celular sem +55 o banco lê como CPF e recusa o Pix
// com uma "indisponibilidade temporária" (achado em produção, 14/11). A
// API não corrige a chave (onze dígitos podem ser CPF), mas avisa no log
// ao subir, com a chave mascarada.

function config(chave: string): ConfigDoPix {
  return { chave, nomeDoRecebedor: "Fulano de Tal", cidadeDoRecebedor: "Sao Paulo", segredo: "s" };
}

function avisos(chave: string) {
  const vistos: { obj: unknown; msg: string }[] = [];
  avisarDaChaveDoPix(config(chave), { warn: (obj, msg) => vistos.push({ obj, msg }) });
  return vistos;
}

describe("avisarDaChaveDoPix", () => {
  it("avisa do celular sem +55 (onze dígitos que não são CPF)", () => {
    const vistos = avisos("11987654321");
    expect(vistos).toHaveLength(1);
    expect(vistos[0]!.msg).toContain("+55");
    expect(vistos[0]!.obj).toEqual({ chave: "•••4321" });
  });

  it("avisa do celular com 55 mas sem o +", () => {
    const vistos = avisos("5511987654321");
    expect(vistos).toHaveLength(1);
    expect(vistos[0]!.msg).toContain("+55");
  });

  it("avisa da chave com pontuação (CPF ou celular com máscara)", () => {
    expect(avisos("529.982.247-25")).toHaveLength(1);
    expect(avisos("(11) 98765-4321")).toHaveLength(1);
    expect(avisos("+55 11 98765-4321")).toHaveLength(1);
    expect(avisos("11.222.333/0001-81")).toHaveLength(1);
  });

  it("não avisa das chaves no formato certo", () => {
    expect(avisos("+5511987654321")).toEqual([]);
    expect(avisos("52998224725")).toEqual([]); // CPF
    expect(avisos("11222333000181")).toEqual([]); // CNPJ
    expect(avisos("pix@exemplo.com")).toEqual([]);
    expect(avisos("123e4567-e89b-12d3-a456-426614174000")).toEqual([]); // aleatória
  });

  it("não faz nada com o Pix desligado", () => {
    const vistos: unknown[] = [];
    avisarDaChaveDoPix(null, { warn: (obj) => vistos.push(obj) });
    expect(vistos).toEqual([]);
  });

  it("nunca põe a chave inteira no log", () => {
    for (const chave of ["11987654321", "5511987654321", "529.982.247-25"]) {
      for (const { obj, msg } of avisos(chave)) {
        expect(JSON.stringify(obj)).not.toContain(chave);
        expect(msg).not.toContain(chave);
      }
    }
  });
});
