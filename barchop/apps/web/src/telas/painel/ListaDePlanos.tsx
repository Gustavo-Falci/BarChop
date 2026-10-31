"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { PlanoDoPainel } from "@barchop/types";
import { Abas } from "../../componentes/Abas";
import { Aviso } from "../../componentes/Aviso";
import { BotaoLink } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Carregando } from "../../componentes/Carregando";
import { Chip } from "../../componentes/Chip";
import { Tabela, type Grupo } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { hojeIso } from "../../formato/datas";
import { precoDoCiclo, quantosAssinam, resumoDosServicos } from "../../painel/planos";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { ListaDeAssinantes } from "./ListaDeAssinantes";
import estilos from "./ListaDePlanos.module.css";

// Os planos que o cliente assina (Onda 2, marco 3): os da casa primeiro,
// depois os de cada barbeiro, porque é o vendedor que decide com quem o
// plano vale e pra quem vai a mensalidade. O profissional recebe só os
// próprios; a recepção vê todos pra vender no balcão, mas não mexe.
function agruparPorVendedor(planos: PlanoDoPainel[]): { id: string; titulo: string; planos: PlanoDoPainel[] }[] {
  const grupos = new Map<string, { id: string; titulo: string; planos: PlanoDoPainel[] }>();
  grupos.set("casa", { id: "casa", titulo: "Da casa", planos: [] });
  for (const plano of planos) {
    const id = plano.vendedor?.id ?? "casa";
    if (!grupos.has(id)) grupos.set(id, { id, titulo: `De ${plano.vendedor!.nome}`, planos: [] });
    grupos.get(id)!.planos.push(plano);
  }
  return [...grupos.values()];
}

type Aba = "planos" | "assinantes";

// `agora` por parâmetro, como no detalhe do cliente: o "Recebi" depende
// de hoje, e o teste fixa o dia.
export function ListaDePlanos({ agora }: { agora?: Date } = {}) {
  const router = useRouter();
  const api = useApiDoPainel();
  const ehDono = usePainel().perfil.papel === "dono";
  const planos = useRequisicao(() => api.barbeiro.planos(), []);
  // Os assinantes valem em qualquer plano do BarChop: quem saiu do
  // Completo segue recebendo as mensalidades de quem já assinou.
  const assinantes = useRequisicao(() => api.barbeiro.assinantes(), []);
  const [aba, setAba] = useState<Aba>("planos");
  // O que o PUT devolveu passa a valer sem reler a lista.
  const [vitrineSalva, setVitrineSalva] = useState<boolean | null>(null);
  const [ligando, setLigando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();

  const hoje = hojeIso(agora);
  const vivas = (assinantes.dados?.assinantes ?? []).filter((a) => a.situacao !== "cancelada").length;
  const painelDosAssinantes = assinantes.erro ? (
    <Aviso>{assinantes.erro.mensagem || "Não foi possível carregar os assinantes agora."}</Aviso>
  ) : assinantes.dados ? (
    <ListaDeAssinantes assinantes={assinantes.dados.assinantes} hoje={hoje} aoMudar={assinantes.recarregar} />
  ) : (
    <Carregando />
  );
  const abas = [
    { id: "planos" as const, rotulo: "Planos" },
    { id: "assinantes" as const, rotulo: vivas > 0 ? `Assinantes ${vivas}` : "Assinantes" },
  ];

  // Fora do Completo, o convite toma o lugar dos planos; a aba dos
  // assinantes só aparece quando há assinatura pra cuidar.
  if (planos.erro?.codigo === "recurso_do_plano") {
    const convite = (
      <div className={estilos.convite}>
        <p>
          Planos de assinatura são do plano Completo: o cliente paga todo mês, volta mais vezes, e o dinheiro cai
          na conta de quem vende.
        </p>
        {ehDono ? (
          <Link className={estilos.principal} href="/painel/faturas">
            Ver os planos do BarChop
          </Link>
        ) : null}
      </div>
    );
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina titulo="Planos" />
        {vivas > 0 ? (
          <Abas
            rotulo="Planos de assinatura"
            abas={abas}
            atual={aba}
            aoTrocar={setAba}
            paineis={{ planos: convite, assinantes: painelDosAssinantes }}
          />
        ) : (
          convite
        )}
      </div>
    );
  }
  if (planos.erro) {
    return <Aviso>{planos.erro.mensagem || "Não foi possível carregar os planos agora."}</Aviso>;
  }
  if (!planos.dados) return <Carregando />;

  const { podeCriarDaCasa, podeCriarProprio } = planos.dados;
  const vitrine = vitrineSalva ?? planos.dados.vitrine;
  // Quem cria também edita; a recepção e o profissional sem a liberação
  // só consultam, e a linha não abre o que daria 403 no salvar.
  const podeMexer = podeCriarDaCasa || podeCriarProprio;

  async function alternarVitrine() {
    setAviso(undefined);
    setLigando(true);
    try {
      setVitrineSalva((await api.barbeiro.ligarVitrine(!vitrine)).ligada);
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setLigando(false);
  }

  const grupos: Grupo[] = agruparPorVendedor(planos.dados.planos).map((grupo) => ({
    id: grupo.id,
    titulo: grupo.titulo,
    linhas: grupo.planos.map((plano) => ({
      id: plano.id,
      atenuada: !plano.ativo,
      celulas: [
        <span className={estilos.nome} key="nome">
          <span className={estilos.titulo}>
            {plano.nome}
            {plano.ativo ? null : (
              <Chip tom="neutro" tamanho="pequeno">
                Desativado
              </Chip>
            )}
            {/* Online marcado e quem vende sem a conta de pagamento: a página
                mostra o plano, mas ninguém assina online. */}
            {plano.ativo && plano.onlineIndisponivel ? (
              <Chip tom="atencao" tamanho="pequeno">
                Pagamento online indisponível
              </Chip>
            ) : null}
          </span>
          <span className={estilos.resumo}>{resumoDosServicos(plano.servicos)}</span>
        </span>,
        precoDoCiclo(plano),
        quantosAssinam(plano.assinantes),
      ],
    })),
  }));

  const painelDosPlanos = (
    <div className={estilos.pagina}>
      {/* A vitrine é da página da barbearia: só o dono liga. */}
      {ehDono ? (
        <div className={estilos.vitrine}>
          <button
            type="button"
            role="switch"
            aria-checked={vitrine}
            aria-describedby="vitrine-efeito"
            className={estilos.interruptor}
            disabled={ligando}
            onClick={alternarVitrine}
          >
            Mostrar os planos na página
            <span className={estilos.trilho} aria-hidden="true">
              <span className={estilos.botaozinho} />
            </span>
          </button>
          <p id="vitrine-efeito" className={estilos.efeito}>
            {vitrine
              ? "Os planos ativos aparecem na sua página, pro cliente conhecer e assinar."
              : "Os planos não aparecem na sua página. Você continua vendendo no balcão."}
          </p>
          {aviso ? <Aviso>{aviso}</Aviso> : null}
        </div>
      ) : null}

      {/* O profissional não tem o índice das Configurações: a conta
          dele se acha daqui. */}
      {podeMexer ? (
        <p className={estilos.efeito}>
          Pra vender online, quem vende conecta a conta do Asaas ou da Stripe em{" "}
          <Link href="/painel/configuracoes/pagamentos-online">Pagamentos online</Link>.
        </p>
      ) : null}

      <Tabela
        cabecalho={["Plano", "Preço", "Assinantes"]}
        larguras={["56%", "24%", "20%"]}
        grupos={grupos}
        vazio="Nenhum plano ainda."
        dicaVazio="Um plano é um preço fixo por ciclo com serviços incluídos: o cliente paga antes e volta mais."
        acaoVazio={podeMexer ? <BotaoLink href="/painel/planos/novo">Criar o primeiro plano</BotaoLink> : undefined}
        aoAbrir={podeMexer ? (id) => router.push(`/painel/planos/${id}`) : undefined}
      />
    </div>
  );

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Planos"
        apoio="Assinaturas que seus clientes pagam todo ciclo, com os serviços incluídos."
        acao={podeMexer ? <BotaoLink href="/painel/planos/novo">+ Novo plano</BotaoLink> : undefined}
      />

      <Abas
        rotulo="Planos de assinatura"
        abas={abas}
        atual={aba}
        aoTrocar={setAba}
        paineis={{ planos: painelDosPlanos, assinantes: painelDosAssinantes }}
      />
    </div>
  );
}
