import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";

import { CadastroDeServico } from "../../../src/telas/painel/CadastroDeServico";
import { ListaDeServicos } from "../../../src/telas/painel/ListaDeServicos";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { montarPainelComSonda } from "../../ajudantes/sondaDeCorrida";

function semear() {
  return criarApiClientFalso({
    servicos: [
      { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: false, categoria: null, descricao: null, fotoUrl: null },
    ],
  });
}

describe("serviços no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos" });
  });

  it("lista ativos e inativos, marcando os inativos", async () => {
    // É desta tela que o barbeiro reativa o que desativou; um inativo
    // que sumisse seria irrecuperável pela interface.
    montarPainel(<ListaDeServicos />, semear());

    expect(await screen.findByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("Barba")).toBeInTheDocument();
    // Escopado na linha do inativo, e não um `getByText(/inativo/i)`
    // solto: a contagem acima da tabela também diz "1 inativo", e a
    // busca solta passaria a casar com as duas.
    const linhaDoInativo = screen.getByText("Barba").closest("tr");
    if (!linhaDoInativo) throw new Error("linha do serviço inativo não encontrada");
    expect(
      within(linhaDoInativo as HTMLElement).getByText(/inativo/i)
    ).toBeInTheDocument();
  });

  it("mostra preço e duração", async () => {
    montarPainel(<ListaDeServicos />, semear());

    expect(await screen.findByText("R$ 40,00")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  it("cria serviço com preço em string", async () => {
    // String, nunca number: o preço é Decimal no banco e float perderia
    // centavo.
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const original = falso.barbeiro.criarServico;
    const criar = vi.fn(
      async (novo: { nome: string; duracaoMinutos: number; preco: string }) =>
        original(novo)
    );
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    // A guarda de sessão resolve o perfil de forma assíncrona; uma
    // consulta síncrona aqui correria contra ela e veria o body vazio.
    await userEvent.type(await screen.findByLabelText(/nome/i), "Sobrancelha");
    await userEvent.type(screen.getByLabelText(/duração/i), "15");
    await userEvent.type(screen.getByLabelText(/preço/i), "20,00");
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        nome: "Sobrancelha",
        duracaoMinutos: 15,
        preco: "20.00",
      })
    );
  });

  it("a edição chega preenchida com o serviço da lista", async () => {
    // Não existe servico(id) no client — a tela acha em servicos().
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    montarPainel(<CadastroDeServico />, semear());

    expect(await screen.findByDisplayValue("Corte")).toBeInTheDocument();
  });

  it("desativa e reativa", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = semear();
    const original = falso.barbeiro.desativarServico;
    const desativar = vi.fn(async (id: string) => original(id));
    falso.barbeiro.desativarServico = desativar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /desativar/i }));

    await waitFor(() => expect(desativar).toHaveBeenCalledWith("s1"));
  });

  it("serviço que não existe vira aviso", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s9", params: { id: "s9" } });
    montarPainel(<CadastroDeServico />, semear());

    expect(await screen.findByText(/serviço não encontrado/i)).toBeInTheDocument();
  });

  // Adicional: a asserção acima só prova que "inativo" aparece em algum
  // lugar da página — passaria também se o chip saísse em toda linha.
  // Esta prova o lado que faltava, escopada na própria linha do ativo
  // pra não pegar o chip da linha do "Barba" e validar por acidente.
  it("não marca o serviço ativo como inativo", async () => {
    montarPainel(<ListaDeServicos />, semear());

    const linhaDoAtivo = (await screen.findByText("Corte")).closest("tr");
    if (!linhaDoAtivo) throw new Error("linha do serviço ativo não encontrada");

    expect(within(linhaDoAtivo as HTMLElement).queryByText(/inativo/i)).not.toBeInTheDocument();
  });

  // Adicional: "20,00" não distingue trocar vírgula por ponto de
  // normalizar pra duas casas — os dois caminhos produzem "20.00" pra
  // essa entrada. "20,5" separa os dois: o normalizado vira "20.50", um
  it("Cancelar volta pra lista sem salvar nada", async () => {
    // Sem ele, a única forma de desistir era a barra lateral — que leva
    // pra outro lugar qualquer do painel, não de volta pra lista de
    // onde a pessoa veio.
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    let chamou = false;
    falso.barbeiro.criarServico = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };

    montarPainel(<CadastroDeServico />, falso);

    // Com o formulário preenchido: desistir de um rascunho em branco não
    // prova nada — o que não pode é o clique salvar o que foi digitado.
    await userEvent.type(await screen.findByLabelText(/nome/i), "Sobrancelha");
    await userEvent.type(screen.getByLabelText(/duração/i), "15");
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/servicos");
    expect(chamou).toBe(false);
  });

  it("na edição o Cancelar também volta pra lista", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/servicos/s1",
      params: { id: "s1" },
    });
    const falso = semear();
    let chamou = false;
    falso.barbeiro.atualizarServico = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };

    montarPainel(<CadastroDeServico />, falso);

    // Espera o formulário sincronizar com o serviço carregado: clicar
    // antes disso testaria uma tela que ainda não é a de edição.
    await screen.findByDisplayValue("Corte");
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/servicos");
    expect(chamou).toBe(false);
  });

  it("Cancelar e Desativar não se confundem na edição", async () => {
    // Os dois são `contorno` e vizinhos na tela. O Cancelar sai sem
    // tocar no serviço; o Desativar muda o estado dele. Um clique no
    // primeiro não pode fazer o segundo.
    navegacaoFalsa.redefinir({
      pathname: "/painel/servicos/s1",
      params: { id: "s1" },
    });
    const falso = semear();
    let desativou = false;
    // Delega pro original em vez de devolver void: `desativarServico`
    // responde o serviço serializado, e um dublê com a assinatura errada
    // passaria nos testes e só quebraria no `tsc`.
    const original = falso.barbeiro.desativarServico;
    falso.barbeiro.desativarServico = async (servicoId: string) => {
      desativou = true;
      return original(servicoId);
    };

    montarPainel(<CadastroDeServico />, falso);

    await screen.findByDisplayValue("Corte");
    expect(screen.getByRole("button", { name: /desativar/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(desativou).toBe(false);
  });

  // replace sem o toFixed(2) ficaria em "20.5".
  it("preço com uma casa decimal ainda vira duas ao salvar", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const original = falso.barbeiro.criarServico;
    const criar = vi.fn(
      async (novo: { nome: string; duracaoMinutos: number; preco: string }) =>
        original(novo)
    );
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(await screen.findByLabelText(/nome/i), "Luzes");
    await userEvent.type(screen.getByLabelText(/duração/i), "40");
    await userEvent.type(screen.getByLabelText(/preço/i), "20,5");
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        nome: "Luzes",
        duracaoMinutos: 40,
        preco: "20.50",
      })
    );
  });

  // Adicional: "desativa e reativa" só cobre a metade que o nome
  // promete — nunca abre um inativo nem clica "Reativar". Pina o
  // método e o corpo, porque atualizarServico com o corpo errado
  // ainda satisfaria uma asserção que só checasse a chamada.
  it("reativa um serviço inativo com o payload certo", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s2", params: { id: "s2" } });
    const falso = semear();
    const original = falso.barbeiro.atualizarServico;
    const atualizar = vi.fn(
      async (id: string, edicao: { ativo?: boolean }) => original(id, edicao)
    );
    falso.barbeiro.atualizarServico = atualizar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /reativar/i }));

    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("s2", { ativo: true }));
  });

  // Adicional: sem checar servicos.erro, uma falha ao buscar a lista
  // deixava dados null pra sempre — o guard de "não encontrado"
  // também depende de dados, então a tela ficava no formulário vazio
  // sem dizer nada.
  it("erro ao buscar serviços vira aviso, não formulário em branco", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = semear();
    falso.barbeiro.servicos = async () => {
      throw new ErroDaApi(500, "erro_interno", "não foi possível carregar os serviços");
    };

    montarPainel(<CadastroDeServico />, falso);

    expect(
      await screen.findByText("não foi possível carregar os serviços")
    ).toBeInTheDocument();
  });

  // Apêndice: CadastroDeServico.tsx sincroniza os campos durante a
  // renderização, mas o rastreador é `atual` (o item achado na lista) e
  // não `servicos.dados` (o array inteiro) — de propósito. O dublê
  // devolve a MESMA referência de array em toda chamada a `servicos()`
  // (`return estado.servicos`, nunca reatribuído; só o item dentro dela
  // é trocado por `{...antigo, ...edicao}`). Se o rastreador fosse
  // `servicos.dados`, a condição `servicos.dados !== anterior` nunca
  // voltaria a ser verdadeira depois de `servicos.recarregar()` — a
  // tela ficaria travada nos valores da primeira leitura pra sempre,
  // mesmo com o servidor tendo mudado o serviço embaixo dela.
  //
  // (Não é uma reprodução da corrida de sincronização em si — isso
  // está no teste seguinte, via a sonda em `sondaDeCorrida.tsx`. Um
  // primeiro round tentou três outras técnicas — temporizador único,
  // MessageChannel na mesma classe de prioridade do agendador do
  // React, e MutationObserver — e nenhuma achou uma janela observável
  // aqui: a render que torna `atual` disponível e o efeito de
  // preenchimento terminam no mesmo turno de JavaScript pra esta tela
  // quando observados de FORA (mesmo forçando um `.find()` sobre um
  // array de 300 mil itens). A sonda funciona porque não observa de
  // fora: ela participa do MESMO commit, e o React garante a ordem
  // entre layout effects e effects passivos dentro dele. Ver o
  // relatório para o histórico completo.)
  it("desativar com um novo nome no servidor atualiza o campo (o rastreador é o item, não a lista)", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = semear();
    // Original capturado antes da troca — mesma nota de sempre: chamar
    // `falso.barbeiro.atualizarServico` de dentro do mock de
    // `desativarServico` só é seguro porque `original` foi salvo antes
    // da reatribuição.
    const original = falso.barbeiro.atualizarServico;
    // Simula o servidor mudando o nome junto da desativação — poderia
    // ser outro barbeiro editando ao mesmo tempo. O que importa pro
    // teste é só que a resposta de `servicos.recarregar()` traga um
    // nome diferente do que já estava no campo.
    falso.barbeiro.desativarServico = async (id: string) =>
      original(id, { ativo: false, nome: "Corte Premium" });

    montarPainel(<CadastroDeServico />, falso);

    expect(await screen.findByDisplayValue("Corte")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /desativar/i }));

    // `alternarAtivo` chama `servicos.recarregar()` depois de desativar:
    // o array devolvido é a mesma referência de sempre, mas o item
    // achado por `.find()` é outro objeto — é essa troca de referência
    // do item que deve reabrir a sincronização.
    expect(await screen.findByDisplayValue("Corte Premium")).toBeInTheDocument();
  });

  // Apêndice: prova a corrida de sincronização em si (a diferença entre
  // este teste e o anterior). Sem trava de carregamento, esta tela
  // renderiza o campo desde o primeiro render — a corrida não é
  // "carregando some, campo aparece vazio", é "o campo já existe, e
  // pode ser digitado antes do rastreador (`atual`) sincronizar os
  // valores buscados nele".
  //
  // Mecanismo (ver `sondaDeCorrida.tsx` e o relatório para o histórico
  // de três tentativas anteriores que não encontraram essa janela
  // observando de fora): uma sonda irmã da tela, com um layout effect
  // sem array de dependências, disparada de dentro do mock de
  // `servicos()` no exato ponto síncrono em que ele retoma de uma
  // promessa travada. O React garante que, dentro do commit em que as
  // duas atualizações caem juntas, layout effects rodam antes de
  // qualquer effect passivo — por isso o layout effect da sonda vê o
  // campo tal como a tela o deixou, antes do `useEffect` de
  // preenchimento (se a tela ainda estiver na versão com bug) rodar.
  it("digitar no instante em que os dados chegam não perde a edição (corrida de sincronização)", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = semear();
    const original = falso.barbeiro.atualizarServico;
    const atualizar = vi.fn(
      async (id: string, edicao: { nome?: string; duracaoMinutos?: number; preco?: string }) =>
        original(id, edicao)
    );
    falso.barbeiro.atualizarServico = atualizar;

    // Trava a leitura da lista até o teste mandar liberar.
    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const servicosOriginal = falso.barbeiro.servicos;
    let disparoDaSonda: () => void = () => {};
    falso.barbeiro.servicos = async () => {
      await pendente;
      // Síncrono, antes de qualquer outro `await`: coloca a
      // atualização da sonda no mesmo lote que o `setDados` da tela.
      disparoDaSonda();
      return servicosOriginal();
    };

    // A sonda roda `aoRenderizar` uma vez no mount (ignorada abaixo,
    // com o formulário ainda sem `atual`) e de novo quando
    // `disparar()` é chamado. Nesse segundo turno, resolve
    // `prontinho`, e o `fireEvent.change` do teste roda no microtask
    // seguinte — ainda antes de qualquer macrotarefa, onde um efeito
    // passivo pendente estaria agendado.
    let chamadas = 0;
    let resolverProntinho: () => void = () => {};
    const prontinho = new Promise<void>((resolve) => {
      resolverProntinho = resolve;
    });
    const { disparar } = montarPainelComSonda(<CadastroDeServico />, falso, () => {
      chamadas++;
      if (chamadas < 2) return; // ignora o mount
      resolverProntinho();
    });
    disparoDaSonda = disparar;

    await screen.findByLabelText(/^nome$/i);
    liberar();

    await prontinho;
    const campo = screen.getByLabelText(/^nome$/i) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "Corte Editado" } });

    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ nome: "Corte Editado" })
      )
    );
  });

  // Nome e preço vêm preenchidos válidos de propósito: o handler
  // valida os três campos e só então decide, então deixar outro campo
  // inválido faria este teste passar sem provar nada sobre a duração.
  it("duração vazia ou não numérica não chama a API — mesma guarda do preço, no campo ao lado", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const criar = vi.fn(falso.barbeiro.criarServico);
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(await screen.findByLabelText(/nome/i), "Sobrancelha");
    await userEvent.type(screen.getByLabelText(/preço/i), "40,00");
    await userEvent.type(screen.getByLabelText(/duração/i), "abc");
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText(/use um número inteiro de minutos/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  // A lista nasce com `dados: null`, e o `?? []` que a tela usava fazia
  // a Tabela receber zero linhas e pintar o estado vazio no primeiro
  // paint: o barbeiro com serviços cadastrados lia "Nenhum serviço
  // cadastrado ainda" — e um botão oferecendo cadastrar o primeiro —
  // toda vez que abria a tela.
  //
  // A leitura fica travada de propósito. Sem a trava, o dublê responde
  // no microtask seguinte e a janela do bug some antes de qualquer
  // asserção: o teste passaria com ou sem a guarda.
  it("não anuncia lista vazia enquanto os serviços ainda estão carregando", async () => {
    const falso = semear();
    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const original = falso.barbeiro.servicos;
    falso.barbeiro.servicos = async () => {
      await pendente;
      return original();
    };

    montarPainel(<ListaDeServicos />, falso);

    expect(await screen.findByText(/carregando/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/nenhum serviço cadastrado ainda/i)
    ).not.toBeInTheDocument();
    // O botão importa à parte da frase: é ele que leva a uma tela de
    // cadastro que o barbeiro não pediu.
    expect(
      screen.queryByRole("button", { name: /cadastrar primeiro serviço/i })
    ).not.toBeInTheDocument();

    liberar();

    expect(await screen.findByText("Corte")).toBeInTheDocument();
  });

  // Espelha o teste irmão de ListaDeClientes, pelo mesmo motivo: com a
  // barra lateral recolhida — só ícones, sem rótulo — "+ Novo" não
  // dizia novo o quê, e o título fica do outro lado da tela.
  it("o botão de criar diz do que é", async () => {
    montarPainel(<ListaDeServicos />, semear());

    expect(
      await screen.findByRole("button", { name: /novo serviço/i })
    ).toBeInTheDocument();
  });

  // A contagem sobe pro apoio do cabeçalho e diz a coisa que importa:
  // quantos o cliente consegue marcar. As pílulas abaixo detalham.
  it("o cabeçalho diz quantos serviços há e quantos estão no agendamento", async () => {
    // `semear()` tem dois serviços, um deles inativo.
    montarPainel(<ListaDeServicos />, semear());

    expect(await screen.findByText("2 serviços · 1 no agendamento")).toBeInTheDocument();
  });

  it("agrupa por categoria, com a faixa de preço de cada grupo", async () => {
    // Do jeito que o cliente vê na página pública: por categoria, e
    // "Sem categoria" no fim.
    const comCategorias = criarApiClientFalso({
      servicos: [
        { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: "Cabelo", descricao: null, fotoUrl: null },
        { id: "s2", nome: "Platinado", duracaoMinutos: 90, preco: "180.00", ativo: true, categoria: "Cabelo", descricao: null, fotoUrl: null },
        { id: "s3", nome: "Sobrancelha", duracaoMinutos: 15, preco: "20.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      ],
    });
    montarPainel(<ListaDeServicos />, comCategorias);

    await screen.findByText("Corte");
    const grupos = screen.getAllByRole("rowheader");
    expect(grupos.map((grupo) => grupo.textContent?.replace(/\s/g, " "))).toEqual([
      "Cabelo2 serviços · R$ 40,00 a R$ 180,00",
      "Sem categoria1 serviço · R$ 20,00",
    ]);
  });

  it("as pílulas separam o que está no agendamento do que saiu dele", async () => {
    montarPainel(<ListaDeServicos />, semear());

    const filtros = await screen.findByRole("group", { name: "Filtrar serviços" });
    expect(within(filtros).getByRole("button", { name: "Todos 2" })).toHaveAttribute("aria-pressed", "true");
    expect(within(filtros).getByRole("button", { name: "No agendamento 1" })).toBeInTheDocument();

    await userEvent.click(within(filtros).getByRole("button", { name: "Fora do agendamento 1" }));

    expect(screen.getByText("Barba")).toBeInTheDocument();
    expect(screen.queryByText("Corte")).not.toBeInTheDocument();
  });

  it("a busca filtra por nome sem voltar à API", async () => {
    // A lista inteira já está na tela: uma ida à API por tecla seria
    // custo sem dado novo.
    const falso = semear();
    const buscar = vi.fn(falso.barbeiro.servicos);
    falso.barbeiro.servicos = buscar;
    montarPainel(<ListaDeServicos />, falso);

    await screen.findByText("Corte");
    await userEvent.type(screen.getByLabelText("Filtrar por nome"), "bar");

    expect(screen.getByText("Barba")).toBeInTheDocument();
    expect(screen.queryByText("Corte")).not.toBeInTheDocument();
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("filtro sem resultado não diz que não há serviço, e oferece ver todos", async () => {
    // "Nenhum serviço cadastrado" aqui seria mentira: há dois, a busca
    // é que não achou.
    montarPainel(<ListaDeServicos />, semear());

    await screen.findByText("Corte");
    await userEvent.type(screen.getByLabelText("Filtrar por nome"), "xyz");

    expect(screen.getByText("Nenhum serviço neste filtro.")).toBeInTheDocument();
    expect(screen.queryByText(/nenhum serviço cadastrado ainda/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ver todos" }));

    expect(screen.getByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("Barba")).toBeInTheDocument();
  });

  it("cada linha diz onde o serviço aparece", async () => {
    montarPainel(<ListaDeServicos />, semear());

    const linhaDoAtivo = (await screen.findByText("Corte")).closest("tr") as HTMLElement;
    const linhaDoInativo = screen.getByText("Barba").closest("tr") as HTMLElement;

    expect(within(linhaDoAtivo).getByText("Site e painel")).toBeInTheDocument();
    expect(within(linhaDoInativo).getByText("Fora do agendamento")).toBeInTheDocument();
  });

  // Com a lista vazia de verdade o estado vazio continua aparecendo —
  // senão a guarda acima teria "consertado" o bug escondendo também o
  // caso que ela deve mostrar.
  it("lista vazia de verdade ainda mostra o estado vazio", async () => {
    montarPainel(<ListaDeServicos />, criarApiClientFalso({ servicos: [] }));

    expect(
      await screen.findByText(/nenhum serviço cadastrado ainda/i)
    ).toBeInTheDocument();
  });

  // As três guardas abaixo espelham o schema de
  // apps/api/src/routers/servicos.ts. O dublê NÃO valida — ele aceita
  // tudo que a API recusaria —, então sem estes testes a divergência
  // entre formulário e schema só apareceria contra o Postgres, como um
  // 400 de ajv que o barbeiro não tem como agir.
  it("duração fora da grade de 5 minutos não chama a API", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const criar = vi.fn(falso.barbeiro.criarServico);
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(await screen.findByLabelText(/nome/i), "Sobrancelha");
    await userEvent.type(screen.getByLabelText(/preço/i), "40,00");
    // 32 passa num `/^\d+$/` e é recusado pelo `multipleOf: 5` da API.
    await userEvent.type(screen.getByLabelText(/duração/i), "32");
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText(/múltiplos de 5/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it("duração acima do teto da API não chama a API", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const criar = vi.fn(falso.barbeiro.criarServico);
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(await screen.findByLabelText(/nome/i), "Dia inteiro");
    await userEvent.type(screen.getByLabelText(/preço/i), "40,00");
    // Múltiplo de 5, mas acima do `maximum: 480` — separa a guarda de
    // faixa da guarda de passo.
    await userEvent.type(screen.getByLabelText(/duração/i), "600");
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText(/entre 5 e 480 minutos/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it("nome vazio não chama a API", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const criar = vi.fn(falso.barbeiro.criarServico);
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    // Nome deixado em branco de propósito; os outros dois, válidos.
    await userEvent.type(await screen.findByLabelText(/duração/i), "30");
    await userEvent.type(screen.getByLabelText(/preço/i), "40,00");
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText(/escreva o nome do serviço/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it("preço maior que o schema aceita não chama a API", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const criar = vi.fn(falso.barbeiro.criarServico);
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(await screen.findByLabelText(/nome/i), "Absurdo");
    await userEvent.type(screen.getByLabelText(/duração/i), "30");
    // Nove dígitos: PADRAO_PRECO para em oito.
    await userEvent.type(screen.getByLabelText(/preço/i), "123456789");
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText(/8 dígitos antes da vírgula/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  // O formulário valida os três campos por tentativa, e não até o
  // primeiro que falha: parando no primeiro, quem errou nome e duração
  // descobre a segunda falha só depois de consertar a primeira.
  it("mostra os erros dos três campos de uma vez", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    montarPainel(<CadastroDeServico />, semear());

    await userEvent.type(await screen.findByLabelText(/nome/i), "C");
    await userEvent.type(screen.getByLabelText(/duração/i), "7");
    await userEvent.type(screen.getByLabelText(/preço/i), "abc");
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText(/escreva o nome do serviço/i)).toBeInTheDocument();
    expect(screen.getByText(/múltiplos de 5/i)).toBeInTheDocument();
    expect(screen.getByText(/use um valor como 40,00/i)).toBeInTheDocument();
  });
});
