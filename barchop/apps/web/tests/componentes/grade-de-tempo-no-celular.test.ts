import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A semana no celular (375): as sete colunas se sobrepunham. O
// `min-width: 120px` estava nos itens, mas as trilhas do grid seguiam
// `minmax(0, 1fr)` — cada trilha ficava com ~40px e a coluna de 120px
// transbordava em cima da vizinha. O jsdom não faz layout, então o teste
// lê a regra do CSS.
//
// Sem o CRLF do checkout no Windows: o fim do bloco é procurado por
// uma chave sozinha na linha.
const css = readFileSync(
  join(__dirname, "../../src/componentes/GradeDeTempo.module.css"),
  "utf8"
).replace(/\r\n/g, "\n");
const doCelular = css.slice(css.indexOf("@media (max-width: 900px)"));
const blocoDoCelular = doCelular.slice(0, doCelular.indexOf("\n}\n") + 2);

describe("grade de tempo no celular", () => {
  it("as trilhas do grid garantem 120px por coluna", () => {
    expect(blocoDoCelular).toMatch(
      /\.cabecalho,\s*\.corpo\s*\{[^}]*grid-template-columns:\s*3\.5rem repeat\(var\(--colunas\), minmax\(120px, 1fr\)\)/
    );
  });

  it("cabeçalho e corpo têm a mesma largura mínima, e rolam juntos dentro do quadro", () => {
    expect(blocoDoCelular).toMatch(/\.quadro\s*\{[^}]*overflow-x:\s*auto/);
    expect(blocoDoCelular).toMatch(
      /\.cabecalho,\s*\.rolagem\s*\{[^}]*min-width:\s*calc\(3\.5rem \+ var\(--colunas\) \* 120px\)/
    );
  });
});
