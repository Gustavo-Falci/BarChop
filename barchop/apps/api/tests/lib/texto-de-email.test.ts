import { describe, expect, it } from "vitest";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { textoDoLembrete, textoDoRemarcado } from "../../src/lib/lembrete";
import { nomeParaEmail } from "../../src/lib/texto-de-email";

// Auditoria de segurança de 15/11, SEC-012: os e-mails do domínio levam
// nomes que qualquer um escreve (barbearia, serviço, cliente) a endereços
// que ninguém provou. Um nome não pode virar link nem recado.
describe("nomeParaEmail", () => {
  it("deixa nome comum como está", () => {
    for (const nome of ["Barbearia do Zé", "GR Barber", "Corte + Barba", "Navalha & Cia.", "Barbearia 2.0", "St. Paul"]) {
      expect(nomeParaEmail(nome)).toBe(nome);
    }
  });

  it("tira endereço web: nada no nome vira link no leitor de e-mail", () => {
    const limpos = [
      nomeParaEmail("Seu banco: confirme em https://banco-seguro.example.com/login"),
      nomeParaEmail("Acesse www.banco.com.br agora"),
      nomeParaEmail("Promo em banco.com/x"),
      nomeParaEmail("fale com suporte@banco.com"),
    ];

    for (const limpo of limpos) {
      expect(limpo).not.toMatch(/https?:|www\.|@|\//i);
      // Nenhum "palavra.palavra": é o que o leitor de e-mail transforma
      // em link sozinho.
      expect(limpo).not.toMatch(/[a-z0-9]\.[a-z]{2,}/i);
    }
  });

  it("corta o que passa do tamanho e junta quebras de linha", () => {
    const longo = nomeParaEmail("A".repeat(200));
    expect(longo.length).toBeLessThanOrEqual(60);

    expect(nomeParaEmail("Barbearia\r\nAssunto: outro\n\ncorpo")).toBe("Barbearia Assunto: outro corpo");
  });

  it("nome que some inteiro vira um nome neutro, não um buraco no texto", () => {
    expect(nomeParaEmail("https://so-link.example.com")).toBe("a barbearia");
    expect(nomeParaEmail("   ", "o serviço")).toBe("o serviço");
  });
});

describe("textos com nomes de terceiros", () => {
  const ISCA = "Seu banco: confirme em https://isca.example.com/login";
  const agendamento = {
    data: dataParaDate("2026-09-10"),
    horaInicio: horaParaDate("10:00"),
    barbearia: { nome: ISCA },
    barbeiro: { nome: "www.isca.example.com" },
    cliente: { nome: "isca.example.com Silva" },
    servicos: [{ servico: { nome: "Corte http://isca.example.com" } }],
  } as never;

  it("o lembrete não leva endereço escrito em nome nenhum", () => {
    const texto = textoDoLembrete(agendamento, undefined);

    expect(texto).not.toMatch(/https?:|www\.|isca\.example/i);
  });

  it("o link de confirmar do próprio sistema continua inteiro", () => {
    const texto = textoDoLembrete(agendamento, "https://um.barchop.com.br/lembrete/abc");

    expect(texto).toContain("https://um.barchop.com.br/lembrete/abc");
    expect(texto).not.toMatch(/isca\.example/i);
  });

  it("o aviso de remarcado também não", () => {
    const texto = textoDoRemarcado(agendamento, { data: dataParaDate("2026-09-09"), horaInicio: horaParaDate("09:00") });

    expect(texto).not.toMatch(/https?:|www\.|isca\.example/i);
  });
});
