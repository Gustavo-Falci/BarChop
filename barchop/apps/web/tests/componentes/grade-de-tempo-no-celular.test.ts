import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A grade no celular. O jsdom não faz layout, então o teste lê a regra
// do CSS.
//
// Até a agenda no celular (PR 5), as colunas tinham 120px e o quadro
// rolava de lado. Agora semana e 3 dias cabem na largura, como no Google
// Agenda; só o dia de uma equipe grande (`data-largas`) rola, com 110px
// por coluna — nas TRILHAS, e não nos itens: com `min-width` só na
// coluna, a trilha seguia `minmax(0, 1fr)` e a coluna transbordava em
// cima da vizinha.
//
// Sem o CRLF do checkout no Windows: o fim do bloco é procurado por
// uma chave sozinha na linha.
const css = readFileSync(
  join(__dirname, "../../src/componentes/GradeDeTempo.module.css"),
  "utf8"
).replace(/\r\n/g, "\n");
const doCelular = css.slice(css.indexOf("@media (max-width: 900px)"));
const blocoDoCelular = doCelular.slice(0, doCelular.indexOf("\n}\n") + 2);
const doContainer = css.slice(css.indexOf("@container (max-width: 60px)"));
const blocoDoContainer = doContainer.slice(0, doContainer.indexOf("\n}\n") + 2);

describe("grade de tempo no celular", () => {
  it("semana e 3 dias cabem na largura: trilhas que encolhem, sem rolar de lado", () => {
    expect(blocoDoCelular).toMatch(
      /\n {2}\.cabecalho,\s*\.corpo\s*\{[^}]*grid-template-columns:\s*2\.25rem repeat\(var\(--colunas\), minmax\(0, 1fr\)\)/
    );
    expect(blocoDoCelular).not.toMatch(/\n {2}\.quadro\s*\{[^}]*overflow-x/);
  });

  it("o dia de equipe grande garante 110px por trilha e rola dentro do quadro", () => {
    expect(blocoDoCelular).toMatch(/\.quadro\[data-largas\]\s*\{[^}]*overflow-x:\s*auto/);
    expect(blocoDoCelular).toMatch(
      /\.quadro\[data-largas\] \.cabecalho,\s*\.quadro\[data-largas\] \.corpo\s*\{[^}]*minmax\(110px, 1fr\)/
    );
    expect(blocoDoCelular).toMatch(
      /\.quadro\[data-largas\] \.cabecalho,\s*\.quadro\[data-largas\] \.rolagem\s*\{[^}]*min-width:\s*calc\(2\.25rem \+ var\(--colunas\) \* 110px\)/
    );
  });

  it("rolando de lado, o eixo das horas fica preso", () => {
    expect(blocoDoCelular).toMatch(/\.quadro\[data-largas\] \.eixo,[^{]*\{[^}]*position:\s*sticky;[^}]*left:\s*0/);
  });

  it("o eixo mostra só a hora cheia (\"09\")", () => {
    expect(blocoDoCelular).toMatch(/\.hora\[data-cheia\]\s*\{[^}]*width:\s*2ch;[^}]*overflow:\s*hidden/);
  });

  it("cada coluna é um container, e o bloco estreito esconde hora e serviço só do olho", () => {
    expect(css).toMatch(/\.coluna\s*\{\s*container-type:\s*inline-size;/);
    expect(blocoDoContainer).toMatch(/\.evento \.horaDoEvento,\s*\.evento \.servicos\s*\{[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
    // `display: none` tiraria do nome acessível.
    expect(blocoDoContainer).not.toMatch(/display:\s*none/);
  });
});
