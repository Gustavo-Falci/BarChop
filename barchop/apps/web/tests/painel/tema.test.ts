import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aplicarTema,
  CHAVE_DO_TEMA,
  gravarTema,
  lerTema,
  SCRIPT_DE_TEMA,
} from "../../src/painel/tema";

// jsdom não implementa matchMedia. O stub fica local a este arquivo
// porque só o script inline (via temaDoSistema) precisa dele.
function stubMatchMedia(prefereEscuro: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefereEscuro,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// Roda o script exatamente como o navegador roda: como uma string solta,
// não como uma função já compilada. new Function reproduz isso — se
// chamássemos uma versão importada da lógica em vez da string em si,
// não estaríamos testando o que de fato vai pro <head>.
function rodarScriptDeTema(): void {
  new Function(SCRIPT_DE_TEMA)();
}

function irParaCaminho(caminho: string): void {
  history.pushState(null, "", caminho);
}

describe("tema do painel", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    irParaCaminho("/");
  });

  it("sem escolha gravada, lerTema devolve null", () => {
    expect(lerTema()).toBeNull();
  });

  it("grava e lê a escolha", () => {
    gravarTema("escuro");

    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("escuro");
    expect(lerTema()).toBe("escuro");
  });

  it("ignora valor estragado no localStorage", () => {
    // Chave editada à mão ou sobrevivente de uma versão anterior não
    // pode virar data-theme="banana" no <html>.
    localStorage.setItem(CHAVE_DO_TEMA, "banana");

    expect(lerTema()).toBeNull();
  });

  it("aplicarTema escreve no <html>, não numa div", () => {
    // O body lê var(--cor-paper) do :root. Custom property redeclarada
    // numa div não chega nele, e o fundo da página ficaria do tema
    // errado em volta do conteúdo certo.
    aplicarTema("escuro");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  describe("o script inline", () => {
    it("no painel, com 'escuro' já gravado, escreve dark", () => {
      irParaCaminho("/painel/agenda");
      localStorage.setItem(CHAVE_DO_TEMA, "escuro");
      stubMatchMedia(false);

      rodarScriptDeTema();

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("no painel, com 'claro' já gravado, escreve light", () => {
      irParaCaminho("/painel/agenda");
      localStorage.setItem(CHAVE_DO_TEMA, "claro");
      stubMatchMedia(true);

      rodarScriptDeTema();

      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("no painel, sem nada gravado e sistema escuro, escreve dark e grava a escolha", () => {
      irParaCaminho("/painel/agenda");
      stubMatchMedia(true);

      rodarScriptDeTema();

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      // A escolha do primeiro acesso fica gravada — da próxima vez não é
      // mais o sistema que decide, é o localStorage.
      expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("escuro");
    });

    it("no painel, com valor estragado gravado, cai pro sistema em vez de escrever o lixo", () => {
      // stubMatchMedia(true) de propósito: se a validação do valor
      // gravado fosse removida, "banana" é truthy e o script usaria o
      // valor estragado direto, caindo no ramo "light" do ternário final
      // — o mesmo resultado que o sistema em modo claro daria. Com o
      // sistema em modo *escuro*, o comportamento certo (ignorar o lixo
      // e cair pro sistema) e o quebrado (usar "banana" como se fosse
      // válido) divergem: "dark" vs "light".
      irParaCaminho("/painel/agenda");
      localStorage.setItem(CHAVE_DO_TEMA, "banana");
      stubMatchMedia(true);

      rodarScriptDeTema();

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      // Segunda confirmação independente: com a validação funcionando, o
      // lixo é substituído por uma escolha válida gravada — não apenas
      // ignorado ao gravar o atributo.
      expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("escuro");
    });

    it("fora do painel, escreve light mesmo com 'escuro' gravado", () => {
      // Esta é a garantia de que o fluxo do cliente depende: nenhuma
      // escolha do barbeiro escurece a página de quem chega por
      // WhatsApp.
      irParaCaminho("/gr-barber");
      localStorage.setItem(CHAVE_DO_TEMA, "escuro");
      stubMatchMedia(true);

      rodarScriptDeTema();

      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });
});
