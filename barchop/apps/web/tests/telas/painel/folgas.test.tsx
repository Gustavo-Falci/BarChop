import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { FolgasEBloqueios } from "../../../src/telas/painel/FolgasEBloqueios";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Folgas sem as caixas "Novo bloqueio" e "Próximos 90 dias" (pedido do
// dono), e o formulário mais direto: quem, quando e o porquê à vista,
// com a frase do que vai acontecer antes do Bloquear.

const AGORA = new Date("2037-01-01T12:00:00-03:00");

function comAna(semente: Parameters<typeof criarApiClientFalso>[0] = {}) {
  const falso = criarApiClientFalso(semente);
  falso.estado.equipe!.push({
    id: "m2",
    nome: "Ana",
    email: "ana@gr.com",
    telefone: null,
    papel: "profissional",
    atende: true,
    ativo: true,
    fotoUrl: null,
    convitePendente: false,
  });
  return falso;
}

describe("folgas: o formulário", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/bloqueios" });
  });

  it("quem fica fora se escolhe à vista, sem abrir lista", async () => {
    montarPainel(<FolgasEBloqueios agora={AGORA} />, comAna());

    const membro = await screen.findByRole("group", { name: "Membro" });
    expect(await within(membro).findByRole("radio", { name: "Ana" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("o dia todo ou só umas horas é uma escolha de duas opções", async () => {
    montarPainel(<FolgasEBloqueios agora={AGORA} />, comAna());

    expect(await screen.findByRole("radio", { name: "Dia inteiro" })).toBeChecked();
    expect(screen.queryByLabelText("Das")).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Só algumas horas" }));
    expect(screen.getByLabelText("Das")).toBeInTheDocument();
    expect(screen.getByLabelText("Às")).toBeInTheDocument();
  });

  it("o Até acompanha o De: folga de um dia é o caso comum", async () => {
    montarPainel(<FolgasEBloqueios agora={AGORA} />, comAna());

    fireEvent.change(await screen.findByLabelText("De"), { target: { value: "2037-01-12" } });
    expect(screen.getByLabelText("Até")).toHaveValue("2037-01-12");
  });

  it("os motivos comuns preenchem o campo num toque", async () => {
    montarPainel(<FolgasEBloqueios agora={AGORA} />, comAna());

    await userEvent.click(await screen.findByRole("button", { name: "Férias" }));
    expect(screen.getByLabelText(/motivo/i)).toHaveValue("Férias");
  });

  it("antes do Bloquear, a frase diz quem fica fora e quando", async () => {
    const falso = comAna();
    const criar = vi.spyOn(falso.barbeiro, "criarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("radio", { name: "Ana" }));
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2037-01-12" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2037-01-16" } });
    expect(
      screen.getByText("Ana fica fora da agenda de 12 a 16 de janeiro, o dia inteiro.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Só algumas horas" }));
    fireEvent.change(screen.getByLabelText("Das"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Às"), { target: { value: "13:00" } });
    expect(
      screen.getByText("Ana fica fora da agenda de 12 a 16 de janeiro, das 12:00 às 13:00.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^bloquear$/i }));
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ barbeiroId: "m2", horaInicio: "12:00", horaFim: "13:00" })
      )
    );
  });
});

describe("folgas: a lista", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/bloqueios" });
  });

  it("o período se lê por extenso", async () => {
    montarPainel(
      <FolgasEBloqueios agora={AGORA} />,
      comAna({
        bloqueios: [
          {
            id: "x1",
            barbeiroId: "m2",
            dataInicio: "2037-01-05",
            dataFim: "2037-01-09",
            horaInicio: null,
            horaFim: null,
            motivo: "Férias",
          },
          {
            id: "x2",
            barbeiroId: "m2",
            dataInicio: "2037-01-20",
            dataFim: "2037-01-20",
            horaInicio: "12:00",
            horaFim: "13:00",
            motivo: null,
          },
        ],
      })
    );

    const ferias = (await screen.findByText("5 a 9 de janeiro")).closest("li") as HTMLElement;
    expect(within(ferias).getByText(/dia inteiro/i)).toBeInTheDocument();
    const almoco = screen.getByText("20 de janeiro").closest("li") as HTMLElement;
    expect(within(almoco).getByText(/12:00 às 13:00/)).toBeInTheDocument();
  });
});
