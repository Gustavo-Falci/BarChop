"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SituacaoDoAssinante } from "@barchop/formato";
import type { AssinaturaDoPainel } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao, BotaoLink } from "../../componentes/Botao";
import { Chip } from "../../componentes/Chip";
import { PilulasDeFiltro, type OpcaoDeFiltro } from "../../componentes/PilulasDeFiltro";
import { Tabela } from "../../componentes/Tabela";
import {
  ROTULO_DA_SITUACAO,
  TOM_DA_SITUACAO,
  deQuemEOPlano,
  fraseDoCiclo,
  fraseDoRecebido,
  podeReceber,
} from "../../painel/planos";
import { JanelaDoRecebi } from "./JanelaDoRecebi";
import estilos from "./ListaDeAssinantes.module.css";

// "Todas" são as que valem ou vão valer; as canceladas ficam no filtro
// delas, pra não encherem a lista.
type Filtro = "todas" | SituacaoDoAssinante;

const ORDEM_DOS_FILTROS: { valor: Exclude<Filtro, "todas">; rotulo: string }[] = [
  { valor: "ativa", rotulo: "Ativas" },
  { valor: "teste", rotulo: "Em teste" },
  { valor: "em_atraso", rotulo: "Em atraso" },
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "cancelada", rotulo: "Canceladas" },
];

function noFiltro(assinatura: AssinaturaDoPainel, filtro: Filtro): boolean {
  return filtro === "todas" ? assinatura.situacao !== "cancelada" : assinatura.situacao === filtro;
}

// Os assinantes da barbearia (Onda 2, marco 3, PR 7b), na aba da tela dos
// planos. A linha abre o cliente, onde se assina e se cancela; o
// "Recebi" fica também aqui, porque é o que o balcão faz todo dia. A
// lista vem inteira de uma vez: as contagens dos filtros precisam dela.
export function ListaDeAssinantes({
  assinantes,
  hoje,
  aoMudar,
}: {
  assinantes: AssinaturaDoPainel[];
  hoje: string;
  aoMudar: () => void;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [recebendo, setRecebendo] = useState<AssinaturaDoPainel | null>(null);
  const [recebido, setRecebido] = useState<string | undefined>();

  const opcoes: OpcaoDeFiltro<Filtro>[] = [
    { valor: "todas", rotulo: "Todas", contagem: assinantes.filter((a) => noFiltro(a, "todas")).length },
    ...ORDEM_DOS_FILTROS.map(({ valor, rotulo }) => ({
      valor,
      rotulo,
      contagem: assinantes.filter((a) => a.situacao === valor).length,
      tom: valor === "em_atraso" ? ("atencao" as const) : undefined,
    })),
  ];
  const visiveis = assinantes.filter((a) => noFiltro(a, filtro));
  const clienteDaLinha = new Map(assinantes.map((a) => [a.id, a.cliente.id]));

  return (
    <div className={estilos.lista}>
      {recebido ? <Aviso tom="sucesso">{recebido}</Aviso> : null}

      {assinantes.length > 0 ? (
        <PilulasDeFiltro rotulo="Filtrar pela situação" opcoes={opcoes} valor={filtro} aoTrocar={setFiltro} />
      ) : null}

      <Tabela
        cabecalho={["Cliente", "Plano", "Situação", "Ciclo", ""]}
        larguras={["26%", "24%", "14%", "24%", "12%"]}
        linhas={visiveis.map((assinatura) => ({
          id: assinatura.id,
          atenuada: assinatura.situacao === "cancelada",
          celulas: [
            <span className={estilos.duasLinhas} key="cliente">
              <span className={estilos.nome}>{assinatura.cliente.nome}</span>
              <span className={estilos.apoio}>{assinatura.forma === "online" ? "Online" : "No balcão"}</span>
            </span>,
            <span className={estilos.duasLinhas} key="plano">
              <span>{assinatura.plano.nome}</span>
              <span className={estilos.apoio}>{deQuemEOPlano(assinatura.plano)}</span>
            </span>,
            <Chip key="situacao" tom={TOM_DA_SITUACAO[assinatura.situacao]} tamanho="pequeno">
              {ROTULO_DA_SITUACAO[assinatura.situacao]}
            </Chip>,
            fraseDoCiclo(assinatura),
            podeReceber(assinatura, hoje) ? (
              // Sem isto, o clique no botão também abriria o cliente.
              <span key="acao" className={estilos.acao} onClick={(evento) => evento.stopPropagation()}>
                <Botao onClick={() => setRecebendo(assinatura)}>Recebi</Botao>
              </span>
            ) : null,
          ],
        }))}
        vazio={assinantes.length === 0 ? "Nenhum assinante ainda." : "Nenhuma assinatura nesta situação."}
        dicaVazio={
          assinantes.length === 0 ? "Pra assinar no balcão, abra o cliente e use o Assinar plano." : undefined
        }
        acaoVazio={
          assinantes.length === 0 ? (
            <BotaoLink href="/painel/clientes" variante="contorno">
              Abrir os clientes
            </BotaoLink>
          ) : undefined
        }
        aoAbrir={(id) => router.push(`/painel/clientes/${clienteDaLinha.get(id)}`)}
      />

      {assinantes.length > 0 ? (
        <p className={estilos.nota}>
          Em atraso, o assinante é atendido como avulso até o pagamento entrar. No balcão, e na InfinitePay quando
          pagam fora do link, o Recebi lança a mensalidade no caixa de hoje.
        </p>
      ) : null}

      {recebendo ? (
        <JanelaDoRecebi
          assinatura={recebendo}
          hoje={hoje}
          aoReceber={(resultado) => {
            setRecebido(`Mensalidade de ${resultado.assinatura.cliente.nome}: ${fraseDoRecebido(resultado, hoje)}.`);
            setRecebendo(null);
            aoMudar();
          }}
          aoFechar={() => setRecebendo(null)}
        />
      ) : null}
    </div>
  );
}
