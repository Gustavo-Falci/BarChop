import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pedido do dono (2026-10-11): cada horário livre da agenda mostra a
// hora escrita (09:15, 09:30…) o tempo todo, e não só ao passar o mouse.
// O botão já tinha a hora dentro; quem a escondia era o CSS (`color:
// transparent`). O jsdom não aplica CSS, então o teste lê a regra.
const css = readFileSync(
  join(__dirname, "../../src/componentes/GradeDeTempo.module.css"),
  "utf8"
).replace(/\r\n/g, "\n");

function regra(seletor: string): string {
  const inicio = css.indexOf(`\n${seletor} {`);
  return inicio < 0 ? "" : css.slice(inicio, css.indexOf("}", inicio) + 1);
}

describe("hora escrita nos horários livres", () => {
  it("a faixa livre tem a hora visível, sem passar o mouse", () => {
    const livre = regra(".livre");
    expect(livre).not.toBe("");
    expect(livre).not.toMatch(/color:\s*transparent/);
    expect(livre).toMatch(/color:\s*var\(--cor-muted\)/);
  });
});
