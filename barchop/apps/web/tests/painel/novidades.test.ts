import { describe, expect, it } from "vitest";
import { contarNovas, NOVIDADES } from "../../src/painel/novidades";

const LISTA = [
  { data: "2026-10-13", titulo: "C", texto: "c" },
  { data: "2026-10-09", titulo: "B", texto: "b" },
  { data: "2026-10-01", titulo: "A", texto: "a" },
];

describe("novidades do painel", () => {
  it("quem nunca abriu vê todas como novas", () => {
    expect(contarNovas(LISTA, null)).toBe(3);
  });

  it("conta só as que saíram depois da última vista", () => {
    expect(contarNovas(LISTA, "2026-10-09")).toBe(1);
    expect(contarNovas(LISTA, "2026-10-13")).toBe(0);
  });

  it("data estragada no localStorage conta como nunca ter visto", () => {
    expect(contarNovas(LISTA, "banana")).toBe(3);
  });

  it("a lista de verdade vem da mais nova pra mais antiga, com data AAAA-MM-DD", () => {
    expect(NOVIDADES.length).toBeGreaterThan(0);
    for (const novidade of NOVIDADES) {
      expect(novidade.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const datas = NOVIDADES.map((n) => n.data);
    expect(datas).toEqual([...datas].sort().reverse());
  });
});
