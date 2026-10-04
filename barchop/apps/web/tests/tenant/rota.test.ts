import { describe, expect, it } from "vitest";
import { decidirRota, type Site } from "../../src/tenant/rota";

const PRODUCAO: Site = { protocolo: "https:", host: "barchop.com.br" };
const DEV: Site = { protocolo: "http:", host: "localhost:3000" };

function decidir(host: string, caminho: string, busca = "", site: Site | undefined = PRODUCAO) {
  return decidirRota({ host, caminho, busca }, site);
}

// Cada barbearia no próprio host (ADR-0002). A decisão é pura — host,
// caminho e config entram, uma de três saídas sai — e o proxy.ts só a
// executa. As rotas continuam em /[slug]: o host da barbearia reescreve
// pra elas, e o caminho com o slug na frente segue valendo.
describe("decidirRota", () => {
  describe("no host da barbearia", () => {
    it("a raiz reescreve pra página da barbearia", () => {
      expect(decidir("gr-barber.barchop.com.br", "/")).toEqual({
        tipo: "reescrever",
        destino: "/gr-barber",
        barbearia: "gr-barber",
      });
    });

    it("um passo do fluxo reescreve com a query junto", () => {
      expect(decidir("gr-barber.barchop.com.br", "/agendar/data", "?servicos=s1")).toEqual({
        tipo: "reescrever",
        destino: "/gr-barber/agendar/data?servicos=s1",
        barbearia: "gr-barber",
      });
    });

    it("o link do lembrete reescreve, com os pontos do token", () => {
      expect(decidir("gr-barber.barchop.com.br", "/lembrete/aaa.bbb.ccc")).toEqual({
        tipo: "reescrever",
        destino: "/gr-barber/lembrete/aaa.bbb.ccc",
        barbearia: "gr-barber",
      });
    });

    it("caminho que já traz o slug segue como está", () => {
      // Os links das telas ainda são /<slug>/…; passam sem dobrar o nome.
      expect(decidir("gr-barber.barchop.com.br", "/gr-barber/agendar")).toEqual({
        tipo: "seguir",
        barbearia: "gr-barber",
      });
      expect(decidir("gr-barber.barchop.com.br", "/gr-barber")).toEqual({
        tipo: "seguir",
        barbearia: "gr-barber",
      });
    });

    it("só o segmento inteiro conta como o slug", () => {
      expect(decidir("gr-barber.barchop.com.br", "/gr-barber-centro")).toEqual({
        tipo: "reescrever",
        destino: "/gr-barber/gr-barber-centro",
        barbearia: "gr-barber",
      });
    });

    it("o painel vai pro host do painel", () => {
      expect(decidir("gr-barber.barchop.com.br", "/painel/agenda", "?dia=2026-10-10")).toEqual({
        tipo: "redirecionar",
        url: "https://painel.barchop.com.br/painel/agenda?dia=2026-10-10",
        status: 308,
      });
    });

    it("lê o host sem diferenciar maiúscula", () => {
      expect(decidir("GR-Barber.BarChop.com.br", "/")).toMatchObject({
        tipo: "reescrever",
        barbearia: "gr-barber",
      });
    });

    it("em desenvolvimento, <slug>.localhost com a porta", () => {
      expect(decidir("gr-barber.localhost:3000", "/agendar", "", DEV)).toEqual({
        tipo: "reescrever",
        destino: "/gr-barber/agendar",
        barbearia: "gr-barber",
      });
    });
  });

  describe("na raiz e no www", () => {
    it("o caminho antigo /<slug> vai pro host da barbearia, com o resto e a query", () => {
      expect(decidir("barchop.com.br", "/gr-barber/agendar", "?servicos=s1")).toEqual({
        tipo: "redirecionar",
        url: "https://gr-barber.barchop.com.br/agendar?servicos=s1",
        status: 308,
      });
      expect(decidir("www.barchop.com.br", "/gr-barber")).toEqual({
        tipo: "redirecionar",
        url: "https://gr-barber.barchop.com.br/",
        status: 308,
      });
    });

    it("o painel vai pro host do painel", () => {
      expect(decidir("barchop.com.br", "/painel")).toEqual({
        tipo: "redirecionar",
        url: "https://painel.barchop.com.br/painel",
        status: 308,
      });
    });

    it("a raiz, os reservados e o que não é slug ficam pro site", () => {
      expect(decidir("barchop.com.br", "/")).toEqual({ tipo: "seguir" });
      expect(decidir("barchop.com.br", "/precos")).toEqual({ tipo: "seguir" });
      expect(decidir("www.barchop.com.br", "/Nao_E_Slug")).toEqual({ tipo: "seguir" });
    });

    it("monta o redirect pela config, nunca pelo host que chegou", () => {
      // Atrás do Caddy o host pode vir com a porta interna; quem manda
      // é o endereço configurado.
      expect(decidir("barchop.com.br:8080", "/gr-barber")).toEqual({ tipo: "seguir" });
      expect(decidir("www.barchop.com.br", "/gr-barber")).toMatchObject({
        url: "https://gr-barber.barchop.com.br/",
      });
    });
  });

  describe("no host do painel", () => {
    it("a raiz abre o painel", () => {
      expect(decidir("painel.barchop.com.br", "/")).toEqual({
        tipo: "redirecionar",
        url: "https://painel.barchop.com.br/painel",
        status: 308,
      });
    });

    it("as rotas do painel seguem sem reescrita", () => {
      expect(decidir("painel.barchop.com.br", "/painel/agenda")).toEqual({ tipo: "seguir" });
    });

    it("a página de uma barbearia vai pro host dela", () => {
      expect(decidir("painel.barchop.com.br", "/gr-barber/agendar")).toEqual({
        tipo: "redirecionar",
        url: "https://gr-barber.barchop.com.br/agendar",
        status: 308,
      });
    });
  });

  describe("fora do tenant", () => {
    it("sem site configurado, tudo segue — o /[slug] do desenvolvimento", () => {
      expect(decidir("localhost:3000", "/gr-barber", "", undefined)).toEqual({ tipo: "seguir" });
      expect(decidir("gr-barber.localhost:3000", "/", "", undefined)).toEqual({ tipo: "seguir" });
    });

    it("host desconhecido segue", () => {
      expect(decidir("10.0.0.5:3000", "/gr-barber")).toEqual({ tipo: "seguir" });
    });

    it("domínio que só termina parecido não é subdomínio", () => {
      expect(decidir("golpe-barchop.com.br", "/")).toEqual({ tipo: "seguir" });
    });

    it("subdomínio reservado ou fora do padrão não vira barbearia", () => {
      expect(decidir("api.barchop.com.br", "/")).toEqual({ tipo: "seguir" });
      expect(decidir("a.b.barchop.com.br", "/")).toEqual({ tipo: "seguir" });
      expect(decidir("x.barchop.com.br", "/")).toEqual({ tipo: "seguir" });
    });
  });
});
