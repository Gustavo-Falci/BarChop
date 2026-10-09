import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { PerfilDaBarbearia } from "../../src/telas/PerfilDaBarbearia";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Terça às dez (aberto) e domingo à tarde (fechado), na semente do
// dublê: seg a sáb, 9 às 18.
const TERCA_10H = new Date("2026-09-29T10:00:00-03:00");
const DOMINGO_15H = new Date("2026-10-04T15:00:00-03:00");

function montar(falso = criarApiClientFalso(), agora = TERCA_10H) {
  render(
    <ProvedorDaApi valor={falso}>
      <PerfilDaBarbearia agora={agora} />
    </ProvedorDaApi>
  );
  return falso;
}

// A fachada: o topo da página pública, que diz de quem é antes de
// qualquer lista. Barbearia recém-criada não tem capa — é o caso comum
// —, e a página não pode abrir vazia por isso.
describe("fachada da página da barbearia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ params: { slug: "gr-barber" } });
  });

  it("sem capa, mostra o monograma da barbearia, que o leitor de tela pula", async () => {
    montar();
    await screen.findByRole("heading", { level: 1 });

    const monograma = screen.getByText("GB");
    expect(monograma.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("img", { name: /capa/i })).toBeNull();
  });

  it("com capa, mostra a foto no lugar do monograma", async () => {
    const falso = criarApiClientFalso();
    const original = falso.publico.perfilDaBarbearia;
    falso.publico.perfilDaBarbearia = async (slug) => ({
      ...(await original(slug)),
      capaUrl: "https://imagens.exemplo/capa.jpg",
    });
    montar(falso);

    expect(await screen.findByRole("img", { name: "Capa da GR Barber" })).toBeInTheDocument();
    expect(screen.queryByText("GB")).toBeNull();
  });

  it("com logo, ela aparece na fachada, na moldura escolhida, junto do nome", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.enviarLogo(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]), "redonda");
    montar(falso);

    await screen.findByRole("heading", { level: 1, name: "GR Barber" });
    const moldura = screen.getByRole("banner").querySelector('[data-formato="redonda"]');
    expect(moldura).not.toBeNull();
    // Decorativa: o nome já é o <h1> ao lado.
    expect(moldura!.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("com logo e sem capa, o monograma não repete as iniciais", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.enviarLogo(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]), "quadrada");
    montar(falso);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("GB")).toBeNull();
  });

  it("sem logo, a fachada não tem moldura de logo", async () => {
    montar();

    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("banner").querySelector("[data-formato]")).toBeNull();
  });

  it("o selo diz se está aberto", async () => {
    montar();

    const selo = await screen.findByText("Aberto agora · fecha às 18:00");
    expect(selo).toHaveAttribute("data-estado", "aberto");
  });

  it("o selo diz se está fechado", async () => {
    montar(criarApiClientFalso(), DOMINGO_15H);

    const selo = await screen.findByText(/^Fechado agora/);
    expect(selo).toHaveAttribute("data-estado", "fechado");
  });

  it("o mapa fica junto do endereço, no topo", async () => {
    montar();
    await screen.findByRole("heading", { level: 1 });

    const topo = screen.getByRole("banner");
    expect(within(topo).getByText("Rua das Tesouras, 123")).toBeInTheDocument();
    expect(within(topo).getByRole("link", { name: /ver no mapa/i })).toBeInTheDocument();
  });

  it("cada profissional diz quais serviços faz", async () => {
    montar();

    const equipe = await screen.findByRole("region", { name: "Equipe" });
    expect(within(equipe).getByText("Rafael")).toBeInTheDocument();
    expect(await within(equipe).findByText("Corte · Barba")).toBeInTheDocument();
  });

  it("a equipe vem logo abaixo do horário de funcionamento (pedido do dono)", async () => {
    montar();

    const equipe = await screen.findByRole("region", { name: "Equipe" });
    const horario = screen.getByRole("heading", { name: "Horário de funcionamento" }).closest("section")!;
    // Mesma coluna, e a equipe é a seção seguinte ao horário.
    expect(horario.parentElement).toBe(equipe.parentElement);
    expect(horario.nextElementSibling).toBe(equipe);
  });

  it("os próximos horários vêm rotulados", async () => {
    montar(
      criarApiClientFalso({
        proximosHorarios: [
          { servicoId: "s1", horarios: [{ data: "2026-09-29", horaInicio: "11:00" }] },
        ],
      })
    );

    const lista = await screen.findByRole("list", { name: "Próximos horários de Corte" });
    expect(lista.previousElementSibling).toHaveTextContent("Próximos:");
  });
});
