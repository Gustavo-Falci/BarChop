"use client";

import { useEffect, useState } from "react";
import { apenasDigitos } from "@barchop/formato";
import { ErroDaApi } from "@barchop/api-client";
import type { ClienteDaLista, FaixaDeCliente } from "@barchop/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { CampoDeBusca } from "../../componentes/CampoDeBusca";
import { PilulasDeFiltro } from "../../componentes/PilulasDeFiltro";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { IconeCalendario } from "../../painel/icones";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./ListaDeClientes.module.css";

// Quanto a busca espera parada antes de virar navegação e requisição.
// 300ms é o intervalo em que uma digitação normal não tem pausa — e a
// pessoa que parou pra ler a lista não sente espera.
const ESPERA_DA_BUSCA = 300;

const SEM_REGISTRO = "Sem registro nos últimos 90 dias";

// As três perguntas que o barbeiro faz sobre a carteira, nesta ordem:
// quem é todo mundo, quem está vindo, e quem sumiu. Filtradas e
// contadas na API, que vê a carteira inteira — a tela só tem a página
// carregada, e um número tirado dela seria uma afirmação que ninguém
// mediu.
function lerFaixa(valor: string | null): FaixaDeCliente {
  return valor === "recentes" || valor === "sumidos" ? valor : "todos";
}

// O endereço da lista com o que estiver ativo. Busca e faixa moram na
// URL pra lista filtrada ser linkável e sobreviver ao recarregar.
function enderecoDaLista(busca: string, faixa: FaixaDeCliente): string {
  const params = new URLSearchParams();
  if (busca) params.set("busca", busca);
  if (faixa !== "todos") params.set("faixa", faixa);
  const query = params.toString();
  return query ? `/painel/clientes?${query}` : "/painel/clientes";
}

// Zap abre no aplicativo com a conversa pronta. O 55 entra aqui porque o
// telefone guardado é nacional — "(15) 99782-7833" vira 5515997827833.
function linkDoZap(telefone: string): string {
  const digitos = apenasDigitos(telefone);
  return `https://wa.me/55${digitos}`;
}

// Desenhado aqui, e não em painel/icones.tsx, pelo mesmo motivo da lupa
// do CampoDeBusca: aquele arquivo é a família da barra lateral, e este é
// uma ação de linha de uma tela só. Mesmo esqueleto mesmo assim — 24x24,
// traço, currentColor, espessura 2 — e 20px, que é o tamanho com que o
// IconeCalendario ao lado sai: os dois dividem a mesma caixa de 32px, e
// 18 contra 20 fazia o par parecer desalinhado antes de qualquer um
// olhar o desenho.
//
// O fone é um arco de canto com um nó em cada ponta, e não o fone da
// marca: dentro da bolha sobram ~10px, e ali um fone literal com traço
// de 2 fecha os vãos e vira borrão — o mesmo que levou a engrenagem a
// seis dentes. O arco é a silhueta que sobrevive ao tamanho real.
function IconeZap() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M9.9 9.4a5.6 5.6 0 0 0 5.2 5.2" />
      <path d="M9.9 9.4 11.3 8M15.1 14.6l1.4-1.4" />
    </svg>
  );
}

// `agora` por parâmetro porque a janela de 90 dias olha o relógio.
export function ListaDeClientes({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const query = useSearchParams();
  const api = useApiDoPainel();
  const busca = query.get("busca") ?? "";
  const faixaDaUrl = lerFaixa(query.get("faixa"));
  // Estado local, e nao o valor da URL direto no campo: o router.push do
  // Next e assincrono, e um campo cujo valor so volta pela URL trava
  // enquanto a navegacao nao acontece - a pessoa digita e nao ve letra.
  // O filtro continua saindo da URL, entao recarregar e o link valem.
  // A faixa também vive em estado local pelo mesmo motivo do campo: a
  // pílula responde na hora, e a URL acompanha por `replace`.
  const [faixa, setFaixa] = useState<FaixaDeCliente>(faixaDaUrl);
  const [digitado, setDigitado] = useState(busca);
  useEffect(() => setDigitado(busca), [busca]);
  useEffect(() => setFaixa(faixaDaUrl), [faixaDaUrl]);

  function trocarFaixa(nova: FaixaDeCliente) {
    setFaixa(nova);
    router.replace(enderecoDaLista(busca, nova));
  }

  // A busca espera a pessoa parar de digitar antes de virar navegação e,
  // por consequência, requisição: `?busca=` é dependência do
  // useRequisicao abaixo, então cada tecla custava uma ida à API —
  // "gustavo" eram sete. O valor que aparece no campo continua sendo o
  // `digitado`, que muda na hora; o que atrasa é só o efeito dele.
  useEffect(() => {
    if (digitado === busca) return;

    const id = setTimeout(() => {
      // replace, não push: cada tecla mudaria a URL, e um push por tecla
      // empilharia uma entrada no histórico por tecla — digitar "joão"
      // deixaria quatro apertos de voltar só pra sair da tela. replace
      // mantém a busca linkável (o que o filtro na URL existe pra dar)
      // sem empilhar nada.
      router.replace(enderecoDaLista(digitado, faixa));
    }, ESPERA_DA_BUSCA);

    return () => clearTimeout(id);
    // `router` fora das deps de propósito: a identidade dele muda a cada
    // navegação, e listá-lo remontaria o temporizador no meio da
    // digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digitado, busca, faixa]);

  const clientes = useRequisicao(
    () => api.barbeiro.clientes(busca, undefined, faixa),
    [busca, faixa]
  );

  // As páginas seguintes moram fora do `useRequisicao`: ele é uma
  // requisição por chave, e o que se quer aqui é acumular. A chave dele
  // continua sendo a busca, então trocar o filtro descarta o acumulado
  // sozinho — é o `useEffect` abaixo que garante isso, e não a sorte.
  const [seguintes, setSeguintes] = useState<ClienteDaLista[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [buscandoMais, setBuscandoMais] = useState(false);
  const [erroDeMais, setErroDeMais] = useState<string | undefined>();

  // Dois efeitos, e não um sobre `clientes.dados`, porque são dois
  // momentos diferentes — e juntá-los tinha um buraco de verdade.
  //
  // Este descarta na hora em que a busca muda. O `useRequisicao` segura
  // a resposta ANTERIOR enquanto a próxima não chega (é o que faz a
  // lista não piscar), então entre a troca do filtro e a chegada da
  // página nova a tela seguia montada com o cursor do filtro velho. Um
  // clique em "carregar mais" nessa janela mandava a busca nova com o
  // cursor antigo, e o Prisma se posicionaria num cliente que o novo
  // `where` talvez nem contenha. Zerando aqui, o botão some durante a
  // transição — que é o certo: não há próxima página até saber qual é a
  // primeira.
  useEffect(() => {
    setSeguintes([]);
    setCursor(null);
    setErroDeMais(undefined);
  }, [busca, faixa]);

  // E este anota o cursor que veio com a página.
  useEffect(() => {
    setCursor(clientes.dados?.proximoCursor ?? null);
  }, [clientes.dados]);

  async function carregarMais() {
    // Trava explícita e não só o `disabled` do botão: um `disabled` que
    // só existe depois do re-render deixa a discriminação depender de
    // quando o React agenda esse render, e dois cliques rápidos
    // pediriam a MESMA página duas vezes — a lista mostraria cada nome
    // dela em duplicata.
    if (!cursor || buscandoMais) return;

    setBuscandoMais(true);
    setErroDeMais(undefined);
    try {
      const pagina = await api.barbeiro.clientes(busca, cursor, faixa);
      setSeguintes((anteriores) => [...anteriores, ...pagina.clientes]);
      setCursor(pagina.proximoCursor);
    } catch (erro) {
      // Aviso ao lado do botão, e não a tela inteira virando erro: o que
      // já está carregado continua válido e útil. Falhar aqui não pode
      // apagar as cem linhas que a pessoa está olhando.
      // `.mensagem` e não `.message`: o construtor do ErroDaApi faz
      // `super(mensagem || codigo)`, então `.message` nunca é vazio — um
      // 500 sem texto chegaria aqui como "erro_interno" e era isso que o
      // barbeiro leria. O campo `mensagem` preserva o vazio, que é o que
      // deixa o fallback em português acontecer.
      setErroDeMais(
        (erro instanceof ErroDaApi && erro.mensagem) ||
          "Não foi possível carregar mais clientes agora."
      );
    } finally {
      setBuscandoMais(false);
    }
  }

  // O corte da coluna "Último agendamento": a API manda a data real,
  // sem janela, e é esta tela que decide que uma data velha não informa.
  const noventaDiasAtras = hojeIso(
    new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000)
  );

  // Só a primeira carga: `dados` guarda a resposta anterior enquanto a
  // próxima não chega, então trocar a busca não pisca — a lista antiga
  // fica à vista até a nova responder.
  //
  // Uma requisição só, e portanto um caminho de erro só. Antes eram
  // duas, e a segunda precisava de um `if (erro)` próprio: sem ele, uma
  // falha ao carregar os agendamentos deixava a coluna inteira dizendo
  // "sem registro" — que não é "não consegui saber", é a afirmação
  // confiante de que ninguém aparece há três meses. Com uma requisição
  // só, o `clientes.erro` abaixo é essa garantia, e não sobra um
  // segundo estado parcial pra alguém esquecer de tratar.
  const carregando = !clientes.dados;

  // A página já vem filtrada pela faixa: o que veio é o que se mostra.
  const listados = [...(clientes.dados?.clientes ?? []), ...seguintes];
  // Quantos existem de verdade no filtro atual — não quantos vieram.
  const total = clientes.dados?.total ?? 0;
  const contagens = clientes.dados?.contagens;

  const quantos = listados.length;
  // Três frases, e a do meio é a que faltava: enquanto houver página
  // por carregar, a contagem diz "de quantos" — senão "100 clientes"
  // numa carteira de 260 seria a mesma mentira silenciosa do teto fixo
  // de antes. Quando tudo já veio, `quantos` e `total` coincidem e a
  // frase volta a ser a simples.
  const contagem = busca
    ? `${quantos} ${quantos === 1 ? "encontrado" : "encontrados"} para “${busca}”`
    : quantos < total
      ? `${quantos} de ${total} clientes`
      : `${quantos} ${quantos === 1 ? "cliente" : "clientes"}`;

  if (clientes.erro) {
    return <Aviso>{clientes.erro.mensagem || "Não foi possível carregar os clientes agora."}</Aviso>;
  }
  // O "—" de antes dizia duas coisas opostas com o mesmo traço: "nunca
  // veio" e "sumiu faz mais de três meses". A frase não afirma nenhuma
  // das duas — diz o que a coluna de fato sabe.
  //
  // A API manda a data real, sem janela, mas a coluna continua cortando
  // em 90 dias: "12 de março" no alto de uma lista em setembro é ruído
  // que parece dado fresco, e a pergunta que a coluna existe pra
  // responder é "esse cliente anda vindo?". A data exata de quem sumiu
  // está no detalhe do cliente, a um clique da linha.
  function ultimoDe(ultima: string | null): string {
    if (!ultima || ultima < noventaDiasAtras) return SEM_REGISTRO;
    return formatarDataLonga(ultima);
  }

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Clientes"
        apoio="Quem já passou pela barbearia, com o último atendimento."
        acao={
          <Botao onClick={() => router.push("/painel/clientes/novo")}>
            + Novo cliente
          </Botao>
        }
      />

      <CampoDeBusca
        rotulo="Buscar por nome ou telefone"
        exemplo="Nome ou telefone"
        valor={digitado}
        onChange={setDigitado}
      />

      {/* O cabeçalho e o campo ficam de pé enquanto carrega, em vez de a
          tela inteira virar "Carregando…": o campo desmontado no meio da
          digitação levaria o foco junto. */}
      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <>
          {/* Sem a contagem, uma lista curta não se distingue de um
              filtro que comeu o resto. A frase fala do que está na tela
              — e não do tamanho da base, que a tela não sabe: a API
              devolve a página filtrada, não um total. */}
          {/* As faixas ocupam a franja que sobrava acima da tabela e
              respondem a pergunta que a ordem alfabética não responde:
              quem está vindo e quem sumiu. Filtram o que já está na
              tela — nenhuma ida nova à API. */}
          <div className={estilos.faixas}>
            <PilulasDeFiltro
              rotulo="Filtrar clientes"
              valor={faixa}
              aoTrocar={trocarFaixa}
              opcoes={[
                { valor: "todos", rotulo: "Todos", contagem: contagens?.todos },
                // Verde pra quem está vindo, âmbar pra quem sumiu: é a
                // faixa que pede uma mensagem.
                { valor: "recentes", rotulo: "Vieram em 30 dias", contagem: contagens?.recentes, tom: "ok" },
                { valor: "sumidos", rotulo: "Sem registro em 90 dias", contagem: contagens?.sumidos, tom: "atencao" },
              ]}
            />
          </div>

          {quantos > 0 ? (
            <p className={estilos.contagem}>{contagem}</p>
          ) : null}

        {/* Tabela e botão no mesmo embrulho, e não soltos na página: é
            o embrulho que leva o `min-height: 0` e, por dentro, o passa
            só pra moldura. Com o botão solto, ele é que seria o último
            filho — a tabela voltaria a crescer sem teto e o cabeçalho
            preso perderia contra o que grudar. */}
        <div className={estilos.lista}>
        <Tabela
          cabecalho={["Nome", "Telefone", "Último agendamento", ""]}
          // Sem largura declarada o excesso de uma tela larga cai todo na
          // última coluna, e sobram centenas de pixels vazios à direita
          // de uma data de doze caracteres.
          larguras={["42%", "20%", "26%", "12%"]}
          // Dois vazios diferentes, porque são duas situações opostas:
          // sem nenhum cliente cadastrado, e uma busca que não achou
          // ninguém. O texto único de antes anunciava base vazia pra quem
          // só tinha digitado o nome errado.
          vazio={
            busca
              ? `Nenhum cliente para “${busca}”.`
              : faixa === "todos"
                ? "Nenhum cliente por aqui ainda."
                : "Nenhum cliente nesta faixa."
          }
          dicaVazio={
            busca
              ? "A busca olha nome e telefone — tente parte do nome, ou só os últimos dígitos."
              : faixa === "todos"
                ? "Cliente cadastrado aqui já aparece na busca do Novo agendamento."
                : "Os outros continuam na lista — a faixa só esconde quem não se encaixa."
          }
          acaoVazio={
            !busca && faixa !== "todos" ? (
              <Botao variante="contorno" onClick={() => trocarFaixa("todos")}>
                Ver todos
              </Botao>
            ) : busca ? (
              <Botao variante="contorno" onClick={() => setDigitado("")}>
                Limpar busca
              </Botao>
            ) : (
              <Botao onClick={() => router.push("/painel/clientes/novo")}>
                Cadastrar primeiro cliente
              </Botao>
            )
          }
          aoAbrir={(id) => router.push(`/painel/clientes/${id}`)}
          linhas={listados.map((cliente) => ({
            id: cliente.id,
            celulas: [
              cliente.nome,
              cliente.telefone,
              ultimoDe(cliente.ultimoAgendamento),
              // Chamar no zap e marcar horário são as duas coisas que se
              // faz com um cliente na tela — e as duas custavam abrir o
              // detalhe e voltar. `stopPropagation` em ambas: a linha
              // inteira abre o detalhe, e uma ação que também abrisse
              // seria a ação errada acontecendo junto.
              <span className={estilos.acoes} key="acoes">
                <a
                  className={estilos.acao}
                  href={linkDoZap(cliente.telefone)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Conversar com ${cliente.nome} no WhatsApp`}
                  onClick={(evento) => evento.stopPropagation()}
                >
                  <IconeZap />
                </a>
                <button
                  type="button"
                  className={estilos.acao}
                  aria-label={`Agendar para ${cliente.nome}`}
                  onClick={(evento) => {
                    evento.stopPropagation();
                    router.push(
                      `/painel/agendamentos/novo?cliente=${cliente.id}`
                    );
                  }}
                >
                  <IconeCalendario />
                </button>
              </span>,
            ],
          }))}
          />

          {/* O botão só aparece quando há página por vir. Fica fora da
              moldura de propósito: dentro, ele rolaria junto das linhas
              e só seria encontrado por quem chegasse ao fim — que é
              exatamente quem já não precisa procurar.

              A faixa ativa não o esconde: ela filtra o carregado, e
              carregar mais é justamente como aparecem mais candidatos
              pra ela. */}
          {cursor ? (
            <div className={estilos.maisClientes}>
              <Botao
                variante="contorno"
                onClick={carregarMais}
                disabled={buscandoMais}
              >
                {buscandoMais ? "Carregando…" : "Carregar mais clientes"}
              </Botao>
              {erroDeMais ? (
                <span className={estilos.erroDeMais} role="status">
                  {erroDeMais}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        </>
      )}
    </div>
  );
}
