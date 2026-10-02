"use client";

import { useRouter } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./ListaDeServicos.module.css";

// A partir de quantas linhas a contagem passa a informar. Com três ou
// menos ela só repete o que a tabela já mostra inteira — "1 serviço"
// acima de uma linha é ruído. Um inativo reabre a frase em qualquer
// tamanho: ele pode estar abaixo da dobra, e a contagem é o único
// lugar onde ele se anuncia sem rolar.
const LINHAS_PARA_CONTAR = 3;

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
  // Inclui os inativos: é desta tela que o barbeiro reativa o que
  // desativou, e um inativo que sumisse seria irrecuperável. A API já
  // devolve ordenado por `[ativo desc, nome asc]`, então os desativados
  // afundam sozinhos — a tela não reordena nada.
  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);

  if (servicos.erro) {
    return <Aviso>{servicos.erro.mensagem || "Não foi possível carregar os serviços agora."}</Aviso>;
  }

  // `dados` nasce null, e a lista vazia que saía dele fazia a `Tabela`
  // pintar o estado vazio no primeiro paint: o barbeiro com doze
  // serviços lia "Nenhum serviço cadastrado ainda" e um botão de
  // cadastrar o primeiro, toda vez que abria a tela. Mesma guarda de
  // ListaDeClientes.
  const carregando = !servicos.dados;
  const listados = servicos.dados ?? [];
  const inativos = listados.filter((servico) => !servico.ativo).length;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Serviços"
        apoio="O que a barbearia oferece, com duração e preço."
        acao={
          // "+ Novo" não dizia novo o quê. Com a barra lateral
          // recolhida — só ícones, sem rótulo — o título da página era
          // a única pista, e ela fica do outro lado da tela. Mesmo
          // conserto que ListaDeClientes já tinha.
          <Botao onClick={() => router.push("/painel/servicos/novo")}>
            + Novo serviço
          </Botao>
        }
      />

      {/* Só a tabela espera. O cabeçalho fica de pé porque o "+ Novo"
          piscando a cada carga é movimento que não informa nada. */}
      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <>
          {listados.length > LINHAS_PARA_CONTAR || inativos > 0 ? (
            <p className={estilos.contagem}>
              {listados.length}{" "}
              {listados.length === 1 ? "serviço" : "serviços"}
              {inativos > 0
                ? ` · ${inativos} inativo${inativos === 1 ? "" : "s"}`
                : ""}
            </p>
          ) : null}

          <Tabela
            cabecalho={["Nome", "Duração", "Preço", ""]}
            // A quarta coluna voltou, mas com outro conteúdo: antes era
            // o chip de "inativo" — vazio em toda linha ativa —, agora
            // é a seta de abrir, que está em TODAS as linhas. Coluna
            // estreita e sempre preenchida, e não 266px de nada no fim
            // da tabela.
            larguras={["50%", "20%", "22%", "8%"]}
            // Duração e preço são número: à direita, para a vírgula de
            // "R$ 40,00" e a de "R$ 180,00" caírem na mesma coluna.
            alinhamentos={["inicio", "fim", "fim", "inicio"]}
            vazio="Nenhum serviço cadastrado ainda."
            dicaVazio="Sem serviço cadastrado ninguém consegue agendar — é ele que define quanto tempo o horário ocupa."
            acaoVazio={
              <Botao onClick={() => router.push("/painel/servicos/novo")}>
                Cadastrar primeiro serviço
              </Botao>
            }
            aoAbrir={(id) => router.push(`/painel/servicos/${id}`)}
            linhas={listados.map((servico) => ({
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
                  {servico.nome}
                  {servico.ativo ? null : <Chip tom="neutro">inativo</Chip>}
                </span>,
                `${servico.duracaoMinutos} min`,
                formatarPreco(servico.preco),
                <span className={estilos.abrir} key="abrir">
                  <IconeAbrir />
                </span>,
              ],
            }))}
          />
        </>
      )}
    </div>
  );
}
