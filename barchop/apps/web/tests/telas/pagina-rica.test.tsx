import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { PerfilDaBarbearia } from "../../src/telas/PerfilDaBarbearia";
import { CadastroDeServico } from "../../src/telas/painel/CadastroDeServico";
import { ConfiguracoesDaBarbearia } from "../../src/telas/painel/ConfiguracoesDaBarbearia";
import { navegacaoFalsa } from "../ajudantes/navegacao";
import { montarPainel } from "../ajudantes/painel";

const TERCA_10H = new Date("2026-09-29T10:00:00-03:00");

function montarPagina(falso: ReturnType<typeof criarApiClientFalso>) {
  render(
    <ProvedorDaApi valor={falso}>
      <PerfilDaBarbearia agora={TERCA_10H} />
    </ProvedorDaApi>
  );
}

async function comPagina(edicao: Parameters<ReturnType<typeof criarApiClientFalso>["barbeiro"]["atualizarMinhaBarbearia"]>[0]) {
  const falso = criarApiClientFalso();
  await falso.barbeiro.atualizarMinhaBarbearia(edicao);
  return falso;
}

describe("página da barbearia rica", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ params: { slug: "gr-barber" } });
  });

  it("contatos: WhatsApp, Instagram e o mapa pelo endereço, em outra aba", async () => {
    montarPagina(await comPagina({ whatsapp: "(11) 98888-7777", instagram: "gr.barber" }));

    const whatsapp = await screen.findByRole("link", { name: /whatsapp/i });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/5511988887777");
    expect(screen.getByRole("link", { name: /@gr\.barber/ })).toHaveAttribute(
      "href",
      "https://instagram.com/gr.barber"
    );
    const mapa = screen.getByRole("link", { name: /ver no mapa/i });
    expect(mapa.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Rua das Tesouras, 123")}`
    );
    for (const link of [whatsapp, mapa]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("sem WhatsApp nem Instagram, sem esses links", async () => {
    montarPagina(criarApiClientFalso());

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: /whatsapp/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /instagram|@/i })).toBeNull();
  });

  it("comodidades e formas de pagamento com os nomes de gente", async () => {
    montarPagina(await comPagina({ comodidades: ["wifi", "cafe"], formasDePagamento: ["pix", "credito"] }));

    const comodidades = await screen.findByRole("region", { name: /comodidades/i });
    expect(within(comodidades).getByText("Wi-Fi")).toBeInTheDocument();
    expect(within(comodidades).getByText("Café")).toBeInTheDocument();
    const pagamento = screen.getByRole("region", { name: /pagamento/i });
    expect(within(pagamento).getByText("Pix")).toBeInTheDocument();
    expect(within(pagamento).getByText("Cartão de crédito")).toBeInTheDocument();
  });

  it("sem comodidade nem pagamento cadastrados, as seções não aparecem", async () => {
    montarPagina(criarApiClientFalso());

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: /comodidades/i })).toBeNull();
    expect(screen.queryByRole("region", { name: /pagamento/i })).toBeNull();
  });

  it("serviços por categoria, sem separar por caixa ou espaço; os sem categoria por último", async () => {
    const falso = criarApiClientFalso({
      servicos: [
        { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: "Cabelo" },
        { id: "s2", nome: "Pigmentação", duracaoMinutos: 30, preco: "50.00", ativo: true, categoria: " cabelo " },
        { id: "s3", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: true, categoria: "Barba" },
        { id: "s4", nome: "Sobrancelha", duracaoMinutos: 15, preco: "15.00", ativo: true, categoria: null },
      ],
    });
    montarPagina(falso);

    await screen.findByText("Pigmentação");
    const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Cabelo", "Barba", "Outros serviços"]);
    const cabelo = screen.getByRole("region", { name: "Cabelo" });
    expect(within(cabelo).getByText("Corte")).toBeInTheDocument();
    expect(within(cabelo).getByText("Pigmentação")).toBeInTheDocument();
  });

  it("sem categoria nenhuma, a lista fica como era, sem subtítulo", async () => {
    montarPagina(criarApiClientFalso());

    await screen.findByText("Corte");
    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([]);
  });

  it("os próximos horários de cada serviço levam direto à confirmação", async () => {
    const falso = criarApiClientFalso({
      proximosHorarios: [
        {
          servicoId: "s1",
          horarios: [
            { data: "2026-09-29", horaInicio: "11:00" },
            { data: "2026-09-30", horaInicio: "09:00" },
            { data: "2026-10-02", horaInicio: "14:30" },
          ],
        },
      ],
    });
    montarPagina(falso);

    const proximos = await screen.findByRole("list", { name: /próximos horários de corte/i });
    const links = within(proximos).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["hoje 11:00", "amanhã 09:00", "sex 02/10 14:30"]);
    expect(links[0]).toHaveAttribute(
      "href",
      "/gr-barber/agendar/confirmar?servicos=s1&data=2026-09-29&hora=11%3A00"
    );
  });

  it("serviço sem horário próximo não mostra a lista", async () => {
    montarPagina(criarApiClientFalso());

    await screen.findByText("Corte");
    expect(screen.queryByRole("list", { name: /próximos horários/i })).toBeNull();
  });
});

describe("página da barbearia nas configurações", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
  });

  it("o dono grava contatos, comodidades e pagamento; o @ digitado sai", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;
    const atualizar = vi.fn(original);
    falso.barbeiro.atualizarMinhaBarbearia = atualizar;
    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    await userEvent.type(await screen.findByLabelText(/^whatsapp/i), "11988887777");
    await userEvent.type(screen.getByLabelText(/^instagram/i), "@gr.barber");
    await userEvent.click(screen.getByRole("checkbox", { name: "Wi-Fi" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Pix" }));
    await userEvent.click(screen.getByRole("button", { name: /salvar página/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith({
        whatsapp: "(11) 98888-7777",
        instagram: "gr.barber",
        comodidades: ["wifi"],
        formasDePagamento: ["pix"],
      })
    );
  });

  it("chega marcado com o que já foi salvo", async () => {
    const falso = await comPagina({ instagram: "gr.barber", comodidades: ["cafe"], formasDePagamento: ["dinheiro"] });
    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    expect(await screen.findByDisplayValue("gr.barber")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Café" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Dinheiro" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Wi-Fi" })).not.toBeChecked();
  });

  it("instagram com link inteiro avisa em vez de mandar pra API", async () => {
    const falso = criarApiClientFalso();
    const atualizar = vi.fn(falso.barbeiro.atualizarMinhaBarbearia);
    falso.barbeiro.atualizarMinhaBarbearia = atualizar;
    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    await userEvent.type(await screen.findByLabelText(/^instagram/i), "https://instagram.com/gr");
    await userEvent.click(screen.getByRole("button", { name: /salvar página/i }));

    expect(await screen.findByText(/só o @/i)).toBeInTheDocument();
    expect(atualizar).not.toHaveBeenCalled();
  });
});

describe("categoria no cadastro de serviço", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("o serviço novo leva a categoria", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = criarApiClientFalso();
    const criar = vi.fn(falso.barbeiro.criarServico);
    falso.barbeiro.criarServico = criar;
    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(await screen.findByLabelText(/^nome/i), "Pigmentação");
    await userEvent.type(screen.getByLabelText(/duração/i), "30");
    await userEvent.type(screen.getByLabelText(/preço/i), "50,00");
    await userEvent.type(screen.getByLabelText(/categoria/i), "Cabelo");
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(expect.objectContaining({ categoria: "Cabelo" }))
    );
  });

  it("na edição, apagar a categoria manda null", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = criarApiClientFalso({
      servicos: [
        { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: "Cabelo" },
      ],
    });
    const atualizar = vi.fn(falso.barbeiro.atualizarServico);
    falso.barbeiro.atualizarServico = atualizar;
    montarPainel(<CadastroDeServico />, falso);

    const campo = await screen.findByDisplayValue("Cabelo");
    await userEvent.clear(campo);
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("s1", expect.objectContaining({ categoria: null }))
    );
  });
});
