"use client";

import { useRouter } from "next/navigation";
import type { PapelMembro } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./ListaDaEquipe.module.css";

export const ROTULO_DO_PAPEL: Record<PapelMembro, string> = {
  dono: "Dono",
  profissional: "Profissional",
  recepcao: "Recepção",
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

  if (equipe.erro) {
    return <Aviso>{equipe.erro.mensagem || "Não foi possível carregar a equipe agora."}</Aviso>;
  }

  const convidar = () => router.push("/painel/equipe/novo");

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Equipe"
        apoio="Quem trabalha na barbearia e o que cada um pode fazer no painel."
        acao={<Botao onClick={convidar}>+ Convidar membro</Botao>}
      />

      {/* Mesma guarda de ListaDeServicos: sem ela a tabela pintaria o
          estado vazio no primeiro paint. */}
      {!equipe.dados ? (
        <p>Carregando…</p>
      ) : (
        <Tabela
          // Na largura toda, com o contato e se atende (as telas usam a
          // largura — pedido do dono).
          cabecalho={["Nome", "Papel", "E-mail", "Telefone", "Atende clientes", ""]}
          larguras={["26%", "13%", "25%", "16%", "12%", "8%"]}
          vazio="Ninguém na equipe ainda."
          aoAbrir={(id) => router.push(`/painel/equipe/${id}`)}
          linhas={equipe.dados.map((membro) => ({
            id: membro.id,
            // Inativo atenua a linha inteira, como o serviço desativado:
            // não entra mais no painel nem na agenda.
            atenuada: !membro.ativo,
            celulas: [
              // Os chips dentro do botão da linha: o nome acessível vira
              // "Ana convite pendente", que é o que se quer ouvir antes
              // de abrir.
              <span className={estilos.nome} key="nome">
                {membro.nome}
                {membro.convitePendente && membro.ativo ? (
                  <Chip>convite pendente</Chip>
                ) : null}
                {membro.ativo ? null : <Chip tom="neutro">inativo</Chip>}
              </span>,
              ROTULO_DO_PAPEL[membro.papel],
              membro.email,
              membro.telefone ?? "—",
              membro.atende ? "Sim" : "Não",
              <span className={estilos.abrir} key="abrir">
                <IconeAbrir />
              </span>,
            ],
          }))}
        />
      )}
    </div>
  );
}
