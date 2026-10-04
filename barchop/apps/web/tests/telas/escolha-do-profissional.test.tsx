import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { PerfilPublicoBarbearia } from "@barchop/types";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { gravarDadosDoCliente } from "../../src/fluxo/dadosDoCliente";
import { caminhoDoPasso, lerEscolhas, montarQuery } from "../../src/fluxo/passos";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { Confirmacao } from "../../src/telas/Confirmacao";
import { EscolhaDaData } from "../../src/telas/EscolhaDaData";
import { EscolhaDoProfissional } from "../../src/telas/EscolhaDoProfissional";
import { MinhaConta } from "../../src/telas/MinhaConta";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Onda 1, C2: o cliente escolhe com quem — ou "qualquer um" — entre os
// serviços e o dia. O profissional viaja na URL (`?profissional=`), por
// último na query; sem ele, a API escolhe quem estiver livre.

const MANHA = new Date("2026-09-09T10:00:00-03:00");

// Rafael faz corte e barba; Ana só corte.
function perfilComEquipe(base = criarApiClientFalso().estado.perfil): PerfilPublicoBarbearia {
  return {
    ...base,
    barbeiros: [
      { id: "bb1", nome: "Rafael", servicoIds: ["s1", "s2"], fotoUrl: null },
      { id: "bb2", nome: "Ana", servicoIds: ["s1"], fotoUrl: null },
    ],
  };
}

function falsoComEquipe() {
  const falso = criarApiClientFalso({ horariosLivres: ["15:00"], diasComVaga: { "2026-09-10": true } });
  falso.estado.perfil = perfilComEquipe(falso.estado.perfil);
  return falso;
}

function montar(tela: React.ReactElement, falso = falsoComEquipe()) {
  render(<ProvedorDaApi valor={falso}>{tela}</ProvedorDaApi>);
  return falso;
}

describe("o profissional na URL do fluxo", () => {
  it("vai por último na query e volta inteiro", () => {
    const escolhas = { servicoIds: ["s1"], data: "2026-09-10", aviso: "horario_ocupado", profissional: "bb2" };

    expect(montarQuery(escolhas)).toBe(
      "?servicos=s1&data=2026-09-10&aviso=horario_ocupado&profissional=bb2"
    );
    expect(lerEscolhas(new URLSearchParams(montarQuery(escolhas).slice(1))).profissional).toBe("bb2");
  });

  it("o passo do profissional mora em /agendar/profissional", () => {
    expect(caminhoDoPasso("gr-barber", "profissional", { servicoIds: ["s1"] })).toBe(
      "/gr-barber/agendar/profissional?servicos=s1"
    );
  });
});

describe("escolher o profissional", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ query: { servicos: "s1" } }));

  it("oferece qualquer um e quem faz os serviços; escolher a Ana segue pro dia com ela", async () => {
    montar(<EscolhaDoProfissional />);

    await userEvent.click(await screen.findByRole("button", { name: /ana/i }));

    expect(screen.getByRole("button", { name: /qualquer um/i })).toBeInTheDocument();
    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1&profissional=bb2"
    );
  });

  it("qualquer um segue pro dia sem profissional na URL", async () => {
    montar(<EscolhaDoProfissional />);

    await userEvent.click(await screen.findByRole("button", { name: /qualquer um/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/agendar/data?servicos=s1");
  });

  it("só oferece quem faz todos os serviços escolhidos", async () => {
    // Corte e barba: só o Rafael faz os dois — e, sendo um só, o passo
    // nem aparece: segue direto pro dia.
    navegacaoFalsa.redefinir({ query: { servicos: "s1,s2" } });
    montar(<EscolhaDoProfissional />);

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/agendar/data?servicos=s1%2Cs2")
    );
    expect(screen.queryByRole("button", { name: /ana/i })).not.toBeInTheDocument();
  });

  it("ninguém faz a combinação: diz isso e oferece voltar aos serviços", async () => {
    const falso = falsoComEquipe();
    falso.estado.perfil = {
      ...falso.estado.perfil,
      barbeiros: [{ id: "bb1", nome: "Rafael", servicoIds: ["s2"], fotoUrl: null }],
    };
    montar(<EscolhaDoProfissional />, falso);

    expect(await screen.findByText(/ninguém da equipe faz/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escolher outros serviços/i })).toHaveAttribute(
      "href",
      "/gr-barber/agendar?servicos=s1"
    );
  });

  it("sem serviço na URL, volta pro passo dos serviços", async () => {
    navegacaoFalsa.redefinir({ query: {} });
    montar(<EscolhaDoProfissional />);

    await waitFor(() => expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/agendar"));
  });
});

describe("o dia e o horário com o profissional", () => {
  it("consulta a agenda de quem foi escolhido", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", profissional: "bb2" } });
    const falso = falsoComEquipe();
    const doMes = vi.spyOn(falso.publico, "disponibilidadeDoMes");
    montar(<EscolhaDaData agora={MANHA} />, falso);

    await waitFor(() => expect(doMes).toHaveBeenCalled());
    expect(doMes.mock.calls[0][1]).toMatchObject({ barbeiroId: "bb2" });
  });

  it("qualquer um consulta sem barbeiroId", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1" } });
    const falso = falsoComEquipe();
    const doMes = vi.spyOn(falso.publico, "disponibilidadeDoMes");
    montar(<EscolhaDaData agora={MANHA} />, falso);

    await waitFor(() => expect(doMes).toHaveBeenCalled());
    expect(doMes.mock.calls[0][1].barbeiroId).toBeUndefined();
  });

  it("profissional que não faz o serviço (link velho, serviço trocado) volta pro passo do profissional", async () => {
    // A Ana não faz barba: sem esta volta, a API responderia 422 e a
    // tela diria só "não foi possível carregar a agenda".
    navegacaoFalsa.redefinir({ query: { servicos: "s1,s2", profissional: "bb2" } });
    montar(<EscolhaDaData agora={MANHA} />);

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
        "/gr-barber/agendar/profissional?servicos=s1%2Cs2"
      )
    );
  });
});

describe("a confirmação com o profissional", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
  });

  it("manda o escolhido e mostra com quem ficou", async () => {
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", hora: "15:00", profissional: "bb2" },
    });
    const falso = falsoComEquipe();
    falso.estado.equipe!.push({
      id: "bb2",
      nome: "Ana",
      email: "ana@gr.com",
      telefone: null,
      papel: "profissional",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
    });
    const agendar = vi.spyOn(falso.publico, "agendar");
    montar(<Confirmacao agora={MANHA} />, falso);

    expect(await screen.findByText(/com ana/i)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /confirmar agendamento/i }));

    await waitFor(() =>
      expect(agendar).toHaveBeenCalledWith("gr-barber", expect.objectContaining({ barbeiroId: "bb2" }))
    );
  });

  it("qualquer um não manda barbeiroId e mostra quem a barbearia escolheu", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10", hora: "15:00" } });
    const falso = falsoComEquipe();
    const agendar = vi.spyOn(falso.publico, "agendar");
    montar(<Confirmacao agora={MANHA} />, falso);

    expect(await screen.findByText(/com quem estiver livre/i)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /confirmar agendamento/i }));

    await waitFor(() => expect(agendar).toHaveBeenCalled());
    expect(agendar.mock.calls[0][1].barbeiroId).toBeUndefined();
    expect(await screen.findByText(/com rafael/i)).toBeInTheDocument();
  });

  it("o horário ocupado volta pro dia sem perder o profissional", async () => {
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", hora: "15:00", profissional: "bb1" },
    });
    const falso = falsoComEquipe();
    await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-10",
      horaInicio: "15:00",
      cliente: { nome: "Outro", telefone: "(11) 98888-7777" },
    });
    montar(<Confirmacao agora={MANHA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /confirmar agendamento/i }));

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/agendar/data?servicos=s1&data=2026-09-10&aviso=horario_ocupado&profissional=bb1"
      )
    );
  });
});

describe("remarcar mantém o profissional", () => {
  it("o link de remarcar leva quem atendeu", async () => {
    const falso = falsoComEquipe();
    await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb2",
      servicoIds: ["s1"],
      data: "2026-09-20",
      horaInicio: "09:30",
      cliente: { nome: "João", telefone: "(11) 99999-8888" },
    });
    navegacaoFalsa.redefinir({});
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    montar(<MinhaConta />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /remarcar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      expect.stringMatching(/\/gr-barber\/agendar\/data\?servicos=s1&remarcar=a1&profissional=bb2$/)
    );
  });
});
