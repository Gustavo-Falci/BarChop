import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { navegacaoFalsa } from "./ajudantes/navegacao";

// O auto-cleanup do Testing Library se pendura num afterEach global, e
// esta suíte roda sem `globals: true` — os imports são explícitos, como
// nos outros pacotes. Sem esta linha o DOM de um teste sobrevive no
// seguinte, e a segunda busca por role acha dois botões.
afterEach(cleanup);

// next/navigation só funciona dentro do roteador do Next. O mock vive
// aqui, e não em cada arquivo de teste, porque o vi.mock é içado pro
// topo do módulo em que aparece.
const rotadorFalso = {
  push: navegacaoFalsa.push,
  replace: navegacaoFalsa.replace,
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: navegacaoFalsa.slug, ...navegacaoFalsa.params }),
  useSearchParams: () => navegacaoFalsa.query,
  usePathname: () => navegacaoFalsa.pathname,
  useRouter: () => rotadorFalso,
}));
