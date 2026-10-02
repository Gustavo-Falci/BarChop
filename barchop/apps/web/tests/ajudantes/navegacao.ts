import { vi } from "vitest";

// As telas leem a URL pelos hooks do Next, que não existem fora do
// roteador. Este módulo guarda o estado que o mock devolve, e o
// setup.ts é quem faz o vi.mock — o mock precisa ser içado pro topo do
// módulo, e um helper importado não seria içado junto.
export const navegacaoFalsa = {
  slug: "gr-barber",
  // As rotas do painel têm [id]; o slug continua separado porque as
  // telas do cliente o leem por nome.
  params: {} as Record<string, string>,
  pathname: "/",
  query: new URLSearchParams(),
  push: vi.fn((_destino: string) => {}),
  replace: vi.fn((_destino: string) => {}),
  redefinir(
    entrada: {
      slug?: string;
      params?: Record<string, string>;
      pathname?: string;
      query?: Record<string, string>;
    } = {}
  ) {
    this.slug = entrada.slug ?? "gr-barber";
    this.params = entrada.params ?? {};
    this.pathname = entrada.pathname ?? "/";
    this.query = new URLSearchParams(entrada.query ?? {});
    this.push.mockClear();
    this.replace.mockClear();
  },
};
