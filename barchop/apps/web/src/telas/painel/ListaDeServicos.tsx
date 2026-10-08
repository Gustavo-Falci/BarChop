"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ServicoSerializado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { CampoDeBusca } from "../../componentes/CampoDeBusca";
import { Chip } from "../../componentes/Chip";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { MiniaturaDoServico } from "../../componentes/MiniaturaDoServico";
import { PilulasDeFiltro } from "../../componentes/PilulasDeFiltro";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { agruparPorCategoria, resumoDoGrupo } from "../../painel/listas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./ListaDeServicos.module.css";

// "No agendamento" é o ativo: o que o cliente consegue marcar no link e
// a recepção no painel. O inativo continua listado — é daqui que ele
// volta —, mas saiu dos dois lugares.
type Filtro = "todos" | "ativos" | "inativos";

const NO_FILTRO: Record<Filtro, (servico: ServicoSerializado) => boolean> = {
  todos: () => true,
  ativos: (servico) => servico.ativo,
  inativos: (servico) => !servico.ativo,
};

// Busca sem acento e sem caixa: "pe" acha "Pé de cabelo" e "PEZINHO".
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Desenhado aqui, e não em painel/icones.tsx, pelo mesmo motivo do
// IconeZap de Clientes: aquele arquivo é a família da barra lateral, e
// este é a marca de uma linha de uma tela só.
//
// Existe porque a linha inteira abre o serviço e nada dizia isso: o
// realce só aparece no hover, que em toque não existe. A seta é a
// convenção de "isto leva a algum lugar" e fica visível o tempo todo.
// Decorativa — quem carrega o nome acessível é o botão da primeira
// célula, então `aria-hidden`.
function IconeAbrir() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ListaDeServicos() {
  const router = useRouter();
  const api = useApiDoPainel();
  // Recepção e profissional consultam a lista (preço e duração), mas
  // quem cadastra é o dono: o botão não aparece pra quem levaria 403.
  const ehDono = usePainel().perfil.papel === "dono";
  // Inclui os inativos: é desta tela que o barbeiro reativa o que
  // desativou, e um inativo que sumisse seria irrecuperável. A API já
  // devolve ordenado por `[ativo desc, nome asc]`, então os desativados
  // afundam sozinhos dentro de cada categoria — a tela não reordena.
  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);
  // Filtro e busca são locais: a lista inteira já está na tela, e uma
  // ida à API por tecla seria custo sem dado novo.
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  if (servicos.erro) {
    return <Aviso>{servicos.erro.mensagem || "Não foi possível carregar os serviços agora."}</Aviso>;
  }

  // `dados` nasce null, e a lista vazia que saía dele fazia a `Tabela`
  // pintar o estado vazio no primeiro paint: o barbeiro com doze
  // serviços lia "Nenhum serviço cadastrado ainda" e um botão de
  // cadastrar o primeiro, toda vez que abria a tela. Mesma guarda de
  // ListaDeClientes.
  const carregando = !servicos.dados;
  const todos = servicos.dados ?? [];
  const ativos = todos.filter(NO_FILTRO.ativos).length;

  const procurado = semAcento(busca.trim());
  const listados = todos.filter(
    (servico) => NO_FILTRO[filtro](servico) && semAcento(servico.nome).includes(procurado)
  );
  // Sem serviço nenhum e "o filtro não achou" são situações opostas: a
  // primeira pede o cadastro, a segunda só desfazer o filtro.
  const filtrando = todos.length > 0;

  function verTodos() {
    setFiltro("todos");
    setBusca("");
  }

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Serviços"
        // A contagem mora no apoio: é a resposta curta a "o que o
        // cliente consegue marcar?". Sem serviço, a frase de sempre.
        apoio={
          todos.length > 0
            ? `${todos.length} ${todos.length === 1 ? "serviço" : "serviços"} · ${ativos} no agendamento`
            : "O que a barbearia oferece, com duração e preço."
        }
        acao={
          // "+ Novo" não dizia novo o quê. Com a barra lateral
          // recolhida — só ícones, sem rótulo — o título da página era
          // a única pista, e ela fica do outro lado da tela. Mesmo
          // conserto que ListaDeClientes já tinha.
          ehDono ? (
            <Botao onClick={() => router.push("/painel/servicos/novo")}>
              + Novo serviço
            </Botao>
          ) : undefined
        }
      />

      {/* Só a tabela espera. O cabeçalho fica de pé porque o "+ Novo"
          piscando a cada carga é movimento que não informa nada. */}
      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <>
          {filtrando ? (
            <div className={estilos.filtros}>
              <CampoDeBusca
                rotulo="Filtrar por nome"
                exemplo="Filtrar por nome"
                valor={busca}
                onChange={setBusca}
              />
              <PilulasDeFiltro
                rotulo="Filtrar serviços"
                valor={filtro}
                aoTrocar={setFiltro}
                opcoes={[
                  { valor: "todos", rotulo: "Todos", contagem: todos.length },
                  { valor: "ativos", rotulo: "No agendamento", contagem: ativos },
                  // Âmbar quando há algum: serviço fora do agendamento é
                  // o que o dono talvez tenha esquecido de reativar.
                  {
                    valor: "inativos",
                    rotulo: "Fora do agendamento",
                    contagem: todos.length - ativos,
                    tom: "atencao",
                  },
                ]}
              />
            </div>
          ) : null}

          <Tabela
            // Categoria virou o título do grupo e a descrição ficou no
            // cadastro: a linha diz o que se decide olhando a lista —
            // quanto tempo, quanto custa e se o cliente vê.
            cabecalho={["Nome", "Duração", "Preço", "Onde aparece", ""]}
            larguras={["44%", "12%", "14%", "22%", "8%"]}
            // Duração e preço são número: à direita, para a vírgula de
            // "R$ 40,00" e a de "R$ 180,00" caírem na mesma coluna.
            alinhamentos={["inicio", "fim", "fim", "inicio", "inicio"]}
            vazio={filtrando ? "Nenhum serviço neste filtro." : "Nenhum serviço cadastrado ainda."}
            dicaVazio={
              filtrando
                ? "Os outros continuam cadastrados — o filtro só esconde quem não se encaixa."
                : "Sem serviço cadastrado ninguém consegue agendar — é ele que define quanto tempo o horário ocupa."
            }
            acaoVazio={
              filtrando ? (
                <Botao variante="contorno" onClick={verTodos}>
                  Ver todos
                </Botao>
              ) : ehDono ? (
                <Botao onClick={() => router.push("/painel/servicos/novo")}>
                  Cadastrar primeiro serviço
                </Botao>
              ) : undefined
            }
            // A linha abre o cadastro, que é só do dono.
            aoAbrir={ehDono ? (id) => router.push(`/painel/servicos/${id}`) : undefined}
            // Agrupado do mesmo jeito que o cliente vê na página
            // pública. O resumo fala do que está à vista no grupo.
            grupos={agruparPorCategoria(listados).map((grupo) => ({
              id: grupo.id,
              titulo: grupo.titulo,
              resumo: resumoDoGrupo(grupo.servicos),
              linhas: grupo.servicos.map((servico) => ({
                id: servico.id,
                // A linha inteira se atenua. "Sumiu do agendamento do
                // cliente" é a propriedade mais importante de um serviço
                // desativado, e anunciá-la só num chip no fim da linha a
                // deixava a meia tabela do nome que ela qualifica.
                atenuada: !servico.ativo,
                celulas: [
                  // O chip entra na primeira célula, ou seja, dentro do
                  // botão que abre a linha: o nome acessível passa a ser
                  // "Platinado inativo", que é exatamente o que se quer
                  // ouvir antes de decidir abrir.
                  <span className={estilos.nome} key="nome">
                    <MiniaturaDoServico nome={servico.nome} fotoUrl={servico.fotoUrl} />
                    {servico.nome}
                    {servico.ativo ? null : <Chip tom="neutro">inativo</Chip>}
                  </span>,
                  `${servico.duracaoMinutos} min`,
                  formatarPreco(servico.preco),
                  servico.ativo ? "Site e painel" : "Fora do agendamento",
                  // Sem a seta pra quem a linha não abre: ela prometeria
                  // um destino que não existe pra esse papel.
                  ehDono ? (
                    <span className={estilos.abrir} key="abrir">
                      <IconeAbrir />
                    </span>
                  ) : null,
                ],
              })),
            }))}
          />
        </>
      )}
    </div>
  );
}
