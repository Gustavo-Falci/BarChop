import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A cena 3D de verdade precisa de WebGL, que o jsdom não tem: o dublê
// devolve uma cena que a gente controla (quando fica pronta, os quadros).
type CenaFalsa = {
  pronta: Promise<void>;
  aplicar: ReturnType<typeof vi.fn>;
  destruir: ReturnType<typeof vi.fn>;
};
let aprontar: () => void = () => {};
let aoQuadro: ((ms: number) => void) | undefined;
let cena: CenaFalsa;

const criarCena = vi.fn((_canvas: HTMLCanvasElement, opcoes?: { aoQuadro?: (ms: number) => void }) => {
  aoQuadro = opcoes?.aoQuadro;
  cena = {
    pronta: new Promise<void>((resolve) => {
      aprontar = resolve;
    }),
    aplicar: vi.fn(),
    destruir: vi.fn(),
  };
  return cena;
});

vi.mock("../../src/site/cena/cadeira", () => ({ criarCena }));

import { CadeiraViva } from "../../src/site/CadeiraViva";
import { QUADROS_MEDIDOS } from "../../src/site/cena/podeTer3D";
import { TOPO_CLARO } from "../../src/site/cena/topoClaro";

// Home nova, marco 3: a cadeira 3D entra por cima da imagem parada, só em
// aparelho que aguenta, depois do load; a rolagem do topo preso chega na
// cena e no CSS; e qualquer tropeço devolve a imagem.

function comReduzirMovimento(sim: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (consulta: string) =>
      ({
        matches: consulta.includes("prefers-reduced-motion") ? sim : false,
        media: consulta,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList
  );
}

function comWebGL2(sim: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((tipo: string) =>
    tipo === "webgl2" && sim ? ({} as RenderingContext) : null) as typeof HTMLCanvasElement.prototype.getContext);
}

function topo() {
  const resultado = render(
    <div data-trilho="">
      <section data-topo="">
        <CadeiraViva />
      </section>
    </div>
  );
  const trilho = resultado.container.querySelector<HTMLElement>("[data-trilho]")!;
  const secao = resultado.container.querySelector<HTMLElement>("[data-topo]")!;
  const canvas = resultado.container.querySelector("canvas")!;
  return { ...resultado, trilho, secao, canvas };
}

async function vivo() {
  const t = topo();
  await waitFor(() => expect(criarCena).toHaveBeenCalled());
  await act(async () => {
    aprontar();
    await cena.pronta;
  });
  await waitFor(() => expect(t.trilho).toHaveAttribute("data-vivo"));
  return t;
}

// O topo preso: o trilho mede 2000 px, o topo 800, e já se rolou `rolado`.
function rolar(trilho: HTMLElement, secao: HTMLElement, rolado: number) {
  Object.defineProperty(trilho, "offsetHeight", { value: 2000, configurable: true });
  Object.defineProperty(secao, "offsetHeight", { value: 800, configurable: true });
  trilho.getBoundingClientRect = () => ({ top: -rolado }) as DOMRect;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("cadeira viva", () => {
  beforeEach(() => {
    criarCena.mockClear();
    aoQuadro = undefined;
    comReduzirMovimento(false);
    comWebGL2(true);
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("o canvas é desenho: fica fora da leitura", () => {
    const { canvas } = topo();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("com reduzir movimento, nem baixa o 3D e o topo não fica preso", async () => {
    comReduzirMovimento(true);
    const { trilho } = topo();
    await new Promise((r) => setTimeout(r, 400));
    expect(criarCena).not.toHaveBeenCalled();
    expect(trilho).not.toHaveAttribute("data-vivo");
  });

  it("sem WebGL2, fica a imagem", async () => {
    comWebGL2(false);
    topo();
    await new Promise((r) => setTimeout(r, 400));
    expect(criarCena).not.toHaveBeenCalled();
  });

  it("se a pessoa já rolou pra longe do topo, fica a imagem", async () => {
    Object.defineProperty(window, "scrollY", { value: 2000, configurable: true });
    topo();
    await new Promise((r) => setTimeout(r, 400));
    expect(criarCena).not.toHaveBeenCalled();
  });

  it("aparelho bom: a imagem só sai depois do primeiro quadro desenhado", async () => {
    const { trilho, secao } = topo();
    await waitFor(() => expect(criarCena).toHaveBeenCalled());
    expect(trilho).not.toHaveAttribute("data-vivo");
    await act(async () => {
      aprontar();
      await cena.pronta;
    });
    await waitFor(() => expect(trilho).toHaveAttribute("data-vivo"));
    expect(secao).toHaveAttribute("data-vivo");
  });

  it("a rolagem do topo preso chega na cena e no CSS", async () => {
    const { trilho, secao } = await vivo();
    rolar(trilho, secao, 600); // progresso 0,5
    await waitFor(() => expect(secao).toHaveAttribute("data-ui", "fora"));
    const ultima = cena.aplicar.mock.calls.at(-1)![0];
    expect(ultima.zoom).toBeGreaterThan(0);
    expect(ultima.nevoa).toBeGreaterThan(0);
    expect(Number(secao.style.getPropertyValue("--escuro"))).toBeLessThan(1);
    expect(Number(secao.style.getPropertyValue("--afastamento"))).toBe(1);
  });

  it("avisa o cabeçalho quando a névoa clareia o topo, e quando volta", async () => {
    const { trilho, secao } = await vivo();
    const avisos: boolean[] = [];
    const ouvir = (ev: Event) => avisos.push((ev as CustomEvent<boolean>).detail);
    document.addEventListener(TOPO_CLARO, ouvir);
    rolar(trilho, secao, 900); // 0,75
    await waitFor(() => expect(avisos).toEqual([true]));
    rolar(trilho, secao, 0);
    await waitFor(() => expect(avisos).toEqual([true, false]));
    document.removeEventListener(TOPO_CLARO, ouvir);
  });

  it("contexto do WebGL perdido devolve a imagem", async () => {
    const { trilho, secao, canvas } = await vivo();
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost"));
    });
    expect(trilho).not.toHaveAttribute("data-vivo");
    expect(secao).not.toHaveAttribute("data-vivo");
    expect(cena.destruir).toHaveBeenCalledTimes(1);
  });

  it("quadros lentos devolvem a imagem", async () => {
    const { trilho } = await vivo();
    act(() => {
      for (let i = 0; i < QUADROS_MEDIDOS; i++) aoQuadro!(60);
    });
    expect(trilho).not.toHaveAttribute("data-vivo");
    expect(cena.destruir).toHaveBeenCalled();
  });

  it("quadros bons mantêm o 3D", async () => {
    const { trilho } = await vivo();
    act(() => {
      for (let i = 0; i < QUADROS_MEDIDOS * 2; i++) aoQuadro!(16);
    });
    expect(trilho).toHaveAttribute("data-vivo");
    expect(cena.destruir).not.toHaveBeenCalled();
  });

  it("ao sair da página, desfaz a cena", async () => {
    const { unmount } = await vivo();
    unmount();
    expect(cena.destruir).toHaveBeenCalledTimes(1);
  });
});
