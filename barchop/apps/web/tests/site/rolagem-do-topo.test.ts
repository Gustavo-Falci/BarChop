import { describe, expect, it } from "vitest";
import { NEVOA_DO_CLARO, estadoDaRolagem } from "../../src/site/cena/rolagem";

// Home nova, marco 3: rolar o topo preso leva a cena do repouso (0) até a
// névoa (1). Uma conta pura, do progresso pro que a cena 3D e o CSS
// precisam; quem lê o scroll e aplica é o topo.
describe("rolagem do topo", () => {
  it("no 0 está tudo em repouso, como a imagem parada", () => {
    const e = estadoDaRolagem(0);
    expect(e.cena).toEqual({ giro: 0, zoom: 0, nevoa: 0, poeira: 1, chao: 1 });
    expect(e.afastamento).toBe(0);
    expect(e.nome).toBe(1);
    expect(e.foco).toBe(1);
    expect(e.grade).toBe(1);
    expect(e.interfaceFora).toBe(false);
    expect(e.escuro).toBe(1);
    expect(e.claro).toBe(false);
  });

  it("a interface sai logo no começo da rolagem", () => {
    expect(estadoDaRolagem(0.02).interfaceFora).toBe(false);
    expect(estadoDaRolagem(0.03).interfaceFora).toBe(true);
  });

  it("o nome se afasta até 0,42 e some entre 0,1 e 0,4", () => {
    expect(estadoDaRolagem(0.42).afastamento).toBe(1);
    expect(estadoDaRolagem(0.2).afastamento).toBeGreaterThan(0);
    expect(estadoDaRolagem(0.2).afastamento).toBeLessThan(1);
    expect(estadoDaRolagem(0.1).nome).toBe(1);
    expect(estadoDaRolagem(0.4).nome).toBe(0);
  });

  it("a cadeira gira uns 45° e chega perto até 0,72", () => {
    const e = estadoDaRolagem(0.72);
    expect(e.cena.zoom).toBe(1);
    expect(e.cena.giro).toBeCloseTo(0.78);
    expect(estadoDaRolagem(1).cena.giro).toBeCloseTo(0.78);
  });

  it("a névoa vem de 0,3 a 0,97; a poeira e o chão somem antes dela", () => {
    expect(estadoDaRolagem(0.3).cena.nevoa).toBe(0);
    expect(estadoDaRolagem(0.97).cena.nevoa).toBe(1);
    expect(estadoDaRolagem(0.55).cena.poeira).toBe(0);
    expect(estadoDaRolagem(0.62).cena.chao).toBe(0);
    expect(estadoDaRolagem(0.66).foco).toBe(0);
    expect(estadoDaRolagem(0.45).grade).toBe(0);
  });

  it("o escuro do topo some e deixa o papel do site, sem faixa na emenda", () => {
    // A camada escura apaga por cima do degradê do próprio site: no fim
    // o topo é o mesmo papel das seções de baixo, até no pé da tela.
    expect(estadoDaRolagem(0.3).escuro).toBe(1);
    expect(estadoDaRolagem(0.5).escuro).toBeGreaterThan(0);
    expect(estadoDaRolagem(0.5).escuro).toBeLessThan(1);
    expect(estadoDaRolagem(0.72).escuro).toBe(0);
    // A névoa do 3D termina no papel (light.paper, #F7F4EE).
    expect(NEVOA_DO_CLARO).toBe(0xf7f4ee);
  });

  it("o cabeçalho clareia depois de 0,62", () => {
    expect(estadoDaRolagem(0.62).claro).toBe(false);
    expect(estadoDaRolagem(0.63).claro).toBe(true);
  });

  it("progresso fora de 0..1 não estoura", () => {
    expect(estadoDaRolagem(-1)).toEqual(estadoDaRolagem(0));
    expect(estadoDaRolagem(3)).toEqual(estadoDaRolagem(1));
  });
});
