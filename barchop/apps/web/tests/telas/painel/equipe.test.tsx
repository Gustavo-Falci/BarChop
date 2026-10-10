import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CODIGO_DO_CONVITE_FALSO, criarApiClientFalso } from "@barchop/api-client";

import PaginaDaEquipe from "../../../app/(painel)/painel/(guardado)/equipe/page";
import PaginaDoNovoServico from "../../../app/(painel)/painel/(guardado)/servicos/novo/page";
import { NavegacaoDoPainel } from "../../../src/painel/NavegacaoDoPainel";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../../src/sessao/armazenamento";
import { AceitarConvite } from "../../../src/telas/painel/AceitarConvite";
import { CadastroDeMembro } from "../../../src/telas/painel/CadastroDeMembro";
import { IndiceDeConfiguracoes } from "../../../src/telas/painel/configuracoes/IndiceDeConfiguracoes";
import { EntrarNoPainel } from "../../../src/telas/painel/EntrarNoPainel";
import { ListaDaEquipe } from "../../../src/telas/painel/ListaDaEquipe";
import { ListaDeServicos } from "../../../src/telas/painel/ListaDeServicos";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Onda 1, A5: as telas da equipe e o que cada papel enxerga no painel.
// Esconder é conforto: quem barra é a API (auth-papeis.test.ts). Mas a
// tela que um papel não pode usar também não abre por URL digitada — ela
// só renderizaria pra devolver 403 no primeiro clique.

function comEquipe() {
  const falso = criarApiClientFalso();
  falso.estado.equipe!.push(
    {
      id: "m2",
      nome: "Ana",
      email: "ana@gr.com",
      telefone: null,
      papel: "profissional",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: true,
    },
    {
      id: "m3",
      nome: "Bia",
      email: "bia@gr.com",
      telefone: null,
      papel: "recepcao",
      atende: false,
      ativo: false,
      fotoUrl: null,
      convitePendente: false,
    }
  );
  return falso;
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/equipe" });
});

describe("o que cada papel vê no painel", () => {
  it("o dono vê Equipe na barra", async () => {
    montarPainel(<NavegacaoDoPainel />);

    expect(await screen.findByRole("link", { name: /equipe/i })).toHaveAttribute(
      "href",
      "/painel/equipe"
    );
  });

  it("recepção e profissional não veem Equipe, mas veem Configurações (o próprio perfil mora lá)", async () => {
    for (const papel of ["recepcao", "profissional"] as const) {
      montarPainel(<NavegacaoDoPainel />, criarApiClientFalso({ papel }));

      expect(await screen.findByRole("link", { name: /configurações/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /equipe/i })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("a tela da equipe por URL digitada, sem ser dono, vira aviso — e nada é listado", async () => {
    const falso = criarApiClientFalso({ papel: "recepcao" });
    const equipe = vi.spyOn(falso.barbeiro, "equipe");

    montarPainel(<PaginaDaEquipe />, falso);

    expect(await screen.findByText(/só o dono/i)).toBeInTheDocument();
    expect(equipe).not.toHaveBeenCalled();
  });

  it("cadastrar serviço por URL digitada, sem ser dono, também vira aviso", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    montarPainel(<PaginaDoNovoServico />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByText(/só o dono/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar/i })).not.toBeInTheDocument();
  });

  it("a lista de serviços continua visível, mas sem o botão de cadastrar", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos" });
    montarPainel(<ListaDeServicos />, criarApiClientFalso({ papel: "recepcao" }));

    expect(await screen.findByText("Corte")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /novo serviço/i })).not.toBeInTheDocument();
  });

  it("em Configurações, quem não é dono vê só o próprio perfil", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByRole("button", { name: /salvar perfil/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar dados/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar horários/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /trocar link/i })).not.toBeInTheDocument();
  });
});

describe("lista da equipe", () => {
  it("mostra cada membro com o papel, o convite pendente e o inativo", async () => {
    montarPainel(<ListaDaEquipe />, comEquipe());

    const ana = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
    expect(within(ana).getByText("Profissional")).toBeInTheDocument();
    expect(within(ana).getByText(/convite pendente/i)).toBeInTheDocument();

    const bia = screen.getByText("Bia").closest("tr") as HTMLElement;
    expect(within(bia).getByText("Recepção")).toBeInTheDocument();
    expect(within(bia).getByText(/inativ/i)).toBeInTheDocument();

    const rafael = screen.getByText("Rafael").closest("tr") as HTMLElement;
    expect(within(rafael).getByText("Dono")).toBeInTheDocument();
  });

  it("o cabeçalho diz quantas pessoas há e quantas atendem", async () => {
    // Rafael (dono) e Ana atendem; Bia é recepção e está inativa.
    montarPainel(<ListaDaEquipe />, comEquipe());

    expect(await screen.findByText("3 pessoas · 2 atendem")).toBeInTheDocument();
  });

  it("as pílulas separam quem atende, quem não entrou e quem saiu", async () => {
    montarPainel(<ListaDaEquipe />, comEquipe());

    const filtros = await screen.findByRole("group", { name: "Filtrar equipe" });
    expect(within(filtros).getByRole("button", { name: "Todos 3" })).toHaveAttribute("aria-pressed", "true");
    expect(within(filtros).getByRole("button", { name: "Atendem 2" })).toBeInTheDocument();
    expect(within(filtros).getByRole("button", { name: "Convites pendentes 1" })).toBeInTheDocument();

    await userEvent.click(within(filtros).getByRole("button", { name: "Inativos 1" }));

    expect(screen.getByText("Bia")).toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
    expect(screen.queryByText("Rafael")).not.toBeInTheDocument();
  });

  it("cada linha diz a situação e mostra o e-mail embaixo do nome", async () => {
    montarPainel(<ListaDaEquipe />, comEquipe());

    const rafael = (await screen.findByText("Rafael")).closest("tr") as HTMLElement;
    expect(within(rafael).getByText("Ativo")).toBeInTheDocument();
    expect(within(rafael).getByText("rafael@gr.com")).toBeInTheDocument();

    const ana = screen.getByText("Ana").closest("tr") as HTMLElement;
    expect(within(ana).getByText("Convite pendente")).toBeInTheDocument();
  });

  it("filtro sem ninguém oferece ver todos", async () => {
    // Só o dono, ninguém inativo.
    montarPainel(<ListaDaEquipe />);

    await userEvent.click(await screen.findByRole("button", { name: "Inativos 0" }));

    expect(screen.getByText("Ninguém neste filtro.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(screen.getByText("Rafael")).toBeInTheDocument();
  });

  it("convidar leva ao cadastro; a linha abre o membro", async () => {
    montarPainel(<ListaDaEquipe />, comEquipe());

    await userEvent.click(await screen.findByRole("button", { name: /convidar/i }));
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe/novo");

    await userEvent.click(screen.getByRole("button", { name: /ana/i }));
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe/m2");
  });
});

describe("convidar um membro", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/painel/equipe/novo" }));

  it("manda nome, e-mail e papel; a recepção sai sem atender, sem ninguém mexer", async () => {
    const falso = criarApiClientFalso();
    const convidar = vi.spyOn(falso.barbeiro, "convidarMembro");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.type(await screen.findByLabelText(/^nome/i), "Bia Lima");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "bia@gr.com");
    await userEvent.click(screen.getByRole("radio", { name: /recepção/i }));
    expect(screen.getByRole("checkbox", { name: /atende clientes/i })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /enviar convite/i }));

    await waitFor(() =>
      expect(convidar).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: "Bia Lima",
          email: "bia@gr.com",
          papel: "recepcao",
          atende: false,
        })
      )
    );
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe");
  });

  it("e-mail já usado aparece no campo do e-mail", async () => {
    montarPainel(<CadastroDeMembro />);

    await userEvent.type(await screen.findByLabelText(/^nome/i), "Outro Rafael");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.click(screen.getByRole("button", { name: /enviar convite/i }));

    const campo = screen.getByLabelText(/e-mail/i);
    await waitFor(() => expect(campo).toHaveAccessibleDescription(/já tem conta/i));
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });

  it("nome curto e e-mail torto param no campo, sem chamar a API", async () => {
    const falso = criarApiClientFalso();
    const convidar = vi.spyOn(falso.barbeiro, "convidarMembro");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.type(await screen.findByLabelText(/^nome/i), "A");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "sem-arroba");
    await userEvent.click(screen.getByRole("button", { name: /enviar convite/i }));

    expect(screen.getByLabelText(/^nome/i)).toHaveAccessibleDescription(/nome/i);
    expect(screen.getByLabelText(/e-mail/i)).toHaveAccessibleDescription(/e-mail/i);
    expect(convidar).not.toHaveBeenCalled();
  });
});

describe("editar um membro", () => {
  it("chega preenchido, com o e-mail fora do formulário", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    expect(await screen.findByDisplayValue("Ana")).toBeInTheDocument();
    expect(screen.getByText("ana@gr.com")).toBeInTheDocument();
    expect(screen.queryByLabelText(/e-mail/i)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /profissional/i })).toBeChecked();
  });

  // Sem caixas, no desenho do detalhe do cliente (pedido do dono,
  // 2026-10-10): o caminho de volta, o nome e a situação no topo.
  it("abre com o caminho de volta pra equipe, o nome no título e a situação ao lado", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    expect(await screen.findByRole("heading", { level: 1, name: "Ana" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Equipe" })).toHaveAttribute("href", "/painel/equipe");
    expect(screen.getByText("Convite pendente")).toBeInTheDocument();
  });

  it("dados e jornada na coluna principal; serviços e situação na lateral", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    const dados = await screen.findByRole("region", { name: "Dados" });
    const jornada = screen.getByRole("region", { name: "Jornada" });
    const servicos = screen.getByRole("region", { name: "Serviços que faz" });
    const situacao = screen.getByRole("region", { name: "Situação" });

    // A coluna de cada grupo: a principal tem dados e jornada, nessa
    // ordem; a lateral, serviços e situação.
    const principal = jornada.parentElement!;
    expect(principal).toContainElement(dados);
    expect(principal).not.toContainElement(servicos);
    expect(dados.compareDocumentPosition(jornada) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const lateral = situacao.parentElement!;
    expect(lateral).toContainElement(servicos);
    expect(lateral).not.toContainElement(dados);
  });

  it("Salvar e Descartar só aparecem depois de mudar os dados; Descartar volta o que estava", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    const nome = await screen.findByDisplayValue("Ana");
    expect(screen.queryByRole("button", { name: /^salvar$/i })).not.toBeInTheDocument();

    await userEvent.type(nome, " Lima");
    expect(screen.getByRole("button", { name: /^salvar$/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByLabelText(/^nome/i)).toHaveValue("Ana");
    expect(screen.queryByRole("button", { name: /^salvar$/i })).not.toBeInTheDocument();
  });

  it("a situação diz o efeito antes do Desativar e do Reativar", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    const situacao = await screen.findByRole("region", { name: "Situação" });
    expect(within(situacao).getByText(/tira da agenda e do painel/i)).toBeInTheDocument();

    await userEvent.click(within(situacao).getByRole("button", { name: "Desativar" }));
    expect(await within(situacao).findByText(/reativar devolve/i)).toBeInTheDocument();
  });

  it("reenvia o convite de quem ainda não aceitou", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
    const falso = comEquipe();
    const reenviar = vi.spyOn(falso.barbeiro, "reenviarConvite");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /reenviar convite/i }));

    await waitFor(() => expect(reenviar).toHaveBeenCalledWith("m2"));
    expect(await screen.findByText(/convite reenviado/i)).toBeInTheDocument();
  });

  it("quem já entrou não tem botão de reenviar", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/bb1", params: { id: "bb1" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    await screen.findByDisplayValue("Rafael");
    expect(screen.queryByRole("button", { name: /reenviar convite/i })).not.toBeInTheDocument();
  });

  it("o último dono que tenta sair do papel recebe o aviso da API", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/bb1", params: { id: "bb1" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    await userEvent.click(await screen.findByRole("radio", { name: /profissional/i }));
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText(/pelo menos um dono/i)).toBeInTheDocument();
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });

  it("desativa e reativa", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
    const falso = comEquipe();
    const atualizar = vi.spyOn(falso.barbeiro, "atualizarMembro");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /desativar/i }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("m2", { ativo: false }));
    await userEvent.click(await screen.findByRole("button", { name: /reativar/i }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("m2", { ativo: true }));
  });

  it("o dono que muda o próprio papel recarrega o perfil — a barra deixa de mostrar Equipe", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/bb1", params: { id: "bb1" } });
    const falso = comEquipe();
    falso.estado.equipe!.push({
      id: "m4",
      nome: "Gustavo",
      email: "gustavo@gr.com",
      telefone: null,
      papel: "dono",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
    });
    const meuPerfil = vi.spyOn(falso.barbeiro, "meuPerfil");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.click(await screen.findByRole("radio", { name: /profissional/i }));
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(meuPerfil).toHaveBeenCalledTimes(2));
  });

  it("membro que não existe vira aviso", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m9", params: { id: "m9" } });
    montarPainel(<CadastroDeMembro />, comEquipe());

    expect(await screen.findByText(/membro não encontrado/i)).toBeInTheDocument();
  });
});

describe("aceitar convite", () => {
  function montarAceite(falso = comEquipe()) {
    render(
      <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
        <AceitarConvite />
      </ProvedorDoPainel>
    );
    return falso;
  }

  beforeEach(() =>
    navegacaoFalsa.redefinir({ pathname: "/painel/convite", query: { email: "ana@gr.com" } })
  );

  it("chega com o e-mail do link, define a senha e entra no painel", async () => {
    montarAceite();

    expect(screen.getByLabelText(/e-mail/i)).toHaveValue("ana@gr.com");
    await userEvent.type(screen.getByLabelText(/código/i), CODIGO_DO_CONVITE_FALSO);
    await userEvent.type(screen.getByLabelText(/^senha$/i), "senha-forte-123");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel"));
    expect(sessaoDoBarbeiro.ler()).toBe("jwt-falso-convidado");
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
  });

  it("código errado aparece no campo do código", async () => {
    montarAceite();

    await userEvent.type(screen.getByLabelText(/código/i), "000000");
    await userEvent.type(screen.getByLabelText(/^senha$/i), "senha-forte-123");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/código/i)).toHaveAccessibleDescription(/inválido ou vencido/i)
    );
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });

  it("a tela de entrar leva quem recebeu convite pra cá", async () => {
    // Sem URL_DO_PAINEL o e-mail do convite vai sem link: a porta é o
    // próprio login do painel.
    navegacaoFalsa.redefinir({ pathname: "/painel/entrar" });
    const falso = criarApiClientFalso();
    render(
      <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
        <EntrarNoPainel />
      </ProvedorDoPainel>
    );

    expect(screen.getByRole("link", { name: /recebi um convite/i })).toHaveAttribute(
      "href",
      "/painel/convite"
    );
  });

  it("senha curta para no campo, sem chamar a API", async () => {
    const falso = comEquipe();
    const aceitar = vi.spyOn(falso.barbeiro, "aceitarConvite");
    montarAceite(falso);

    await userEvent.type(screen.getByLabelText(/código/i), CODIGO_DO_CONVITE_FALSO);
    await userEvent.type(screen.getByLabelText(/^senha$/i), "curta");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(screen.getByLabelText(/^senha$/i)).toHaveAccessibleDescription(/8 caracteres/i);
    expect(aceitar).not.toHaveBeenCalled();
  });
});
