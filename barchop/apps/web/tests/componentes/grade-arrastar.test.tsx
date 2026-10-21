import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgendamentoComCliente } from "@barchop/types";

import { GradeDeTempo } from "../../src/componentes/GradeDeTempo";
import { gradeDeTempo } from "../../src/painel/grade";

// Arrastar e reordenar, PR 7: a ligação do arrasto na grade — o mouse
// anda, o fantasma mostra o horário novo encaixado, soltar entrega o
// destino, e o clique que o navegador manda depois não abre o
// agendamento. A regra do destino está em painel/arrasto.test.ts.

const AGORA = new Date(2026, 9, 21, 8, 0);
const HORARIOS = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
}));
const CORTE = {
  id: "a1",
  data: "2026-10-22",
  horaInicio: "10:00",
  horaFim: "10:30",
  status: "confirmado",
  origem: "barbeiro",
  observacoes: null,
  presencaConfirmadaEm: null,
  barbeiro: { id: "bb1", nome: "Rafael" },
  servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
  cliente: { id: "c1", nome: "João", telefone: "11999990000", email: null, temConta: false },
} as AgendamentoComCliente;

// O jsdom não mede layout. A coluna ganha 10px por linha de 5 minutos
// (09:00 às 18:00 são 108 linhas) e 100px de largura: andar 150px pra
// baixo são 75 minutos.
const ALTURA_DA_LINHA = 10;
const LINHAS_DO_DIA = 108;
const medirOriginal = HTMLElement.prototype.getBoundingClientRect;

function montar(aoSoltar = vi.fn(), aoAbrir = vi.fn()) {
  const grade = gradeDeTempo({ dias: ["2026-10-22", "2026-10-23"], horarios: HORARIOS, agendamentos: [CORTE], agora: AGORA });
  render(
    <GradeDeTempo
      grade={grade}
      agora={AGORA}
      aoAbrir={aoAbrir}
      aoCriar={() => {}}
      podeMover={() => true}
      aoSoltar={aoSoltar}
    />
  );
  return { aoSoltar, aoAbrir };
}

describe("arrastar um agendamento na grade", () => {
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.dataset.coluna === undefined) return medirOriginal.call(this);
      const altura = LINHAS_DO_DIA * ALTURA_DA_LINHA;
      return { x: 0, y: 0, top: 0, left: 0, width: 100, height: altura, right: 100, bottom: altura, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = medirOriginal;
  });

  it("o fantasma mostra o horário novo, soltar entrega o destino e o clique depois não abre", async () => {
    const { aoSoltar, aoAbrir } = montar();
    const bloco = screen.getByRole("button", { name: /10:00 João/ });

    await act(async () => {
      fireEvent.mouseDown(bloco, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(document, { clientX: 10, clientY: 20 });
      fireEvent.mouseMove(document, { clientX: 10, clientY: 10 + 15 * ALTURA_DA_LINHA });
    });

    expect(screen.getByText("11:15 – 11:45")).toBeInTheDocument();

    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 10, clientY: 10 + 15 * ALTURA_DA_LINHA });
    });
    fireEvent.click(bloco);

    expect(aoSoltar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1" }),
      expect.objectContaining({ data: "2026-10-22", horaInicio: "11:15", valido: true })
    );
    expect(aoAbrir).not.toHaveBeenCalled();
    expect(screen.queryByText("11:15 – 11:45")).not.toBeInTheDocument();
    // O dnd-kit escuta o clique no documento por 50ms depois de soltar;
    // sem esperar, ele engoliria o clique do teste seguinte.
    await act(() => new Promise((pronto) => setTimeout(pronto, 60)));
  });

  it("um clique sem arrastar continua abrindo o agendamento", () => {
    const { aoAbrir, aoSoltar } = montar();

    fireEvent.click(screen.getByRole("button", { name: /10:00 João/ }));

    expect(aoAbrir).toHaveBeenCalledWith("a1");
    expect(aoSoltar).not.toHaveBeenCalled();
  });
});
