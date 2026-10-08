"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MembroDaEquipe, PapelMembro } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { PilulasDeFiltro } from "../../componentes/PilulasDeFiltro";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { situacaoDoMembro, type SituacaoDoMembro } from "../../painel/listas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./ListaDaEquipe.module.css";

export const ROTULO_DO_PAPEL: Record<PapelMembro, string> = {
  dono: "Dono",
  profissional: "Profissional",
  recepcao: "Recepção",
};

// O selo da coluna Situação: verde quem já está no painel, âmbar quem
// ainda não aceitou o convite, neutro quem saiu.
const SELO: Record<SituacaoDoMembro, { rotulo: string; tom: "ok" | "atencao" | "neutro" }> = {
  ativo: { rotulo: "Ativo", tom: "ok" },
  convite: { rotulo: "Convite pendente", tom: "atencao" },
  inativo: { rotulo: "Inativo", tom: "neutro" },
};

// "Atendem" é quem aparece na agenda pro cliente marcar: ativo e com
// `atende`. As outras duas pílulas são as situações que pedem ação.
type Filtro = "todos" | "atendem" | "convites" | "inativos";

const NO_FILTRO: Record<Filtro, (membro: MembroDaEquipe) => boolean> = {
  todos: () => true,
  atendem: (membro) => membro.ativo && membro.atende,
  convites: (membro) => situacaoDoMembro(membro) === "convite",
  inativos: (membro) => situacaoDoMembro(membro) === "inativo",
};

// A mesma seta de ListaDeServicos: a linha inteira abre o membro, e sem
// hover (toque) nada mais diria isso. Decorativa — quem nomeia é o
// botão da primeira célula.
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

export function ListaDaEquipe() {
  const router = useRouter();
  const api = useApiDoPainel();
  // A API já devolve ativos antes, na ordem de entrada na equipe — a
  // tela não reordena.
  const equipe = useRequisicao(() => api.barbeiro.equipe(), []);
  // Filtro local: a equipe inteira já vem numa resposta só.
  const [filtro, setFiltro] = useState<Filtro>("todos");

  if (equipe.erro) {
    return <Aviso>{equipe.erro.mensagem || "Não foi possível carregar a equipe agora."}</Aviso>;
  }

  const convidar = () => router.push("/painel/equipe/novo");
  const todos = equipe.dados ?? [];
  const contar = (qual: Filtro) => todos.filter(NO_FILTRO[qual]).length;
  const atendem = contar("atendem");
  const listados = todos.filter(NO_FILTRO[filtro]);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Equipe"
        // A contagem no apoio, como em Serviços: quantos são e quantos o
        // cliente consegue escolher na agenda.
        apoio={
          equipe.dados
            ? `${todos.length} ${todos.length === 1 ? "pessoa" : "pessoas"} · ${atendem} ${atendem === 1 ? "atende" : "atendem"}`
            : "Quem trabalha na barbearia e o que cada um pode fazer no painel."
        }
        acao={<Botao onClick={convidar}>+ Convidar membro</Botao>}
      />

      {/* Mesma guarda de ListaDeServicos: sem ela a tabela pintaria o
          estado vazio no primeiro paint. */}
      {!equipe.dados ? (
        <p>Carregando…</p>
      ) : (
        <>
          <PilulasDeFiltro
            rotulo="Filtrar equipe"
            valor={filtro}
            aoTrocar={setFiltro}
            opcoes={[
              { valor: "todos", rotulo: "Todos", contagem: todos.length },
              { valor: "atendem", rotulo: "Atendem", contagem: atendem },
              // Âmbar quando há algum: é gente que ainda não consegue
              // entrar, e o reenvio do convite está a um clique.
              { valor: "convites", rotulo: "Convites pendentes", contagem: contar("convites"), tom: "atencao" },
              { valor: "inativos", rotulo: "Inativos", contagem: contar("inativos") },
            ]}
          />

          <Tabela
            cabecalho={["Nome", "Papel", "Telefone", "Atende", "Situação", ""]}
            larguras={["34%", "14%", "16%", "10%", "18%", "8%"]}
            vazio={filtro === "todos" ? "Ninguém na equipe ainda." : "Ninguém neste filtro."}
            acaoVazio={
              filtro === "todos" ? undefined : (
                <Botao variante="contorno" onClick={() => setFiltro("todos")}>
                  Ver todos
                </Botao>
              )
            }
            aoAbrir={(id) => router.push(`/painel/equipe/${id}`)}
            linhas={listados.map((membro) => {
              const selo = SELO[situacaoDoMembro(membro)];
              return {
                id: membro.id,
                // Inativo atenua a linha inteira, como o serviço
                // desativado: não entra mais no painel nem na agenda.
                atenuada: !membro.ativo,
                celulas: [
                  // Nome e e-mail juntos, dentro do botão da linha: o
                  // e-mail é como o membro entra, e é o que distingue
                  // dois "João".
                  <span className={estilos.nome} key="nome">
                    {membro.nome}
                    {membro.email ? <span className={estilos.email}>{membro.email}</span> : null}
                  </span>,
                  ROTULO_DO_PAPEL[membro.papel],
                  membro.telefone ?? "—",
                  membro.atende ? "Sim" : "Não",
                  <Chip key="situacao" tom={selo.tom} tamanho="pequeno">
                    {selo.rotulo}
                  </Chip>,
                  <span className={estilos.abrir} key="abrir">
                    <IconeAbrir />
                  </span>,
                ],
              };
            })}
          />
        </>
      )}
    </div>
  );
}
