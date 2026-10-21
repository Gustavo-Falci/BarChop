import { render, screen } from "@testing-library/react";
import { m } from "motion/react";
import { describe, expect, it } from "vitest";

import { ProvedorDeMovimento } from "../../src/movimento/ProvedorDeMovimento";

describe("ProvedorDeMovimento", () => {
  it("renderiza os filhos", () => {
    render(
      <ProvedorDeMovimento>
        <p>tela</p>
      </ProvedorDeMovimento>
    );
    expect(screen.getByText("tela")).toBeInTheDocument();
  });

  it("aceita o componente leve `m` sem reclamar do modo estrito", () => {
    // `strict` só quebra com `motion.div` cheio; o `m` é o que os
    // componentes devem usar.
    render(
      <ProvedorDeMovimento>
        <m.div>animável</m.div>
      </ProvedorDeMovimento>
    );
    expect(screen.getByText("animável")).toBeInTheDocument();
  });
});
