import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Decisão do dono (2026-10-17, análise de UI/UX): o horário livre da
// agenda NÃO escreve a hora o tempo todo — a semana tinha ~250 horários
// iguais e o agendamento sumia no meio. A hora fica no botão (é o nome
// dele pro leitor de tela) e aparece onde o clique vai cair: hover, foco
// ou toque. Substitui o pedido de 2026-10-11 (hora sempre visível). O
// jsdom não aplica CSS, então o teste lê a regra.
const css = readFileSync(
  join(__dirname, "../../src/componentes/GradeDeTempo.module.css"),
  "utf8"
).replace(/\r\n/g, "\n");

function regra(seletor: string): string {
  const inicio = css.indexOf(`\n${seletor} {`);
  return inicio < 0 ? "" : css.slice(inicio, css.indexOf("}", inicio) + 1);
}

describe("hora nos horários livres", () => {
  it("parada, a faixa livre não escreve a hora", () => {
    const livre = regra(".livre");
    expect(livre).not.toBe("");
    expect(livre).toMatch(/color:\s*transparent/);
  });

  it("no hover, no foco e no toque, a hora aparece", () => {
    expect(css).toMatch(
      /\.livre:hover,\n\.livre:focus-visible,\n\.livre:active \{[^}]*color:\s*var\(--cor-ink-soft\)/
    );
  });
});
