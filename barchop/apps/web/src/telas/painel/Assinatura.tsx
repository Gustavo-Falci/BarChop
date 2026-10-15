"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ErroDaApi } from "@barchop/api-client";
import {
  PLANOS,
  formatarReais,
  limiteDeProfissionais,
  precoDoPlano,
  precosDoCiclo,
  type Ciclo,
  type Recurso,
} from "@barchop/formato";
import type { ResumoDaAssinatura } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import {
  diaEMes,
  diasQueFaltam,
  fraseDaCobranca,
  nomeDoPlano,
  profissionais,
  temPlanoPago,
} from "../../painel/assinatura";
import { useAssinatura } from "../../painel/ProvedorDaAssinatura";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { irParaAStripe } from "../../painel/stripe";
import estilos from "./Assinatura.module.css";

// A tela do plano (Onda 2, marco 1, PR 5): um configurador de preço no
// jeito da tela de assinatura do Barbeiro.app — plano, profissionais e
// ciclo numa linha, o cartão do plano com a conta à vista, e as
// perguntas de sempre embaixo. Pagar, trocar o cartão, ver as faturas e
// cancelar é tudo na Stripe; aqui é só o caminho até lá.

type PlanoPago = "essencial" | "completo";

// A Stripe exige o fim do teste pelo menos 48h à frente; com menos, a
// API cobra na hora (fimDoTesteNaCobranca, em apps/api/src/lib/cobranca.ts).
const FOLGA_DO_TESTE = 48 * 60 * 60 * 1000 + 10 * 60 * 1000;

// Na volta do Checkout, o webhook costuma chegar em segundos; 15
// consultas de 2s cobrem o atraso comum sem consultar pra sempre.
const CONSULTAS_NA_VOLTA = 15;

const NOMES_DOS_RECURSOS: Record<Recurso, string> = {
  caixa: "caixa",
  relatorios: "relatórios",
  relatoriosCompletos: "relatórios completos",
  whatsapp: "WhatsApp",
  planosDaBarbearia: "planos para os seus clientes",
};

// Os recursos que o plano promete e o BarChop ainda não tem: a tela diz
// "em breve" em vez de vender o que não existe (decisão 8 do plano).
function recursosEmBreve(plano: PlanoPago): string {
  const recursos = PLANOS[plano].recursos.filter(
    (recurso) => !(recurso === "relatorios" && PLANOS[plano].recursos.includes("relatoriosCompletos"))
  );
  const nomes = recursos.map((recurso) => NOMES_DOS_RECURSOS[recurso]);
  return new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(nomes);
}

function seloDaSituacao(resumo: ResumoDaAssinatura) {
  switch (resumo.situacao) {
    case "teste":
      return resumo.diasDeTesteRestantes ? (
        <Chip tamanho="pequeno">Teste grátis · {diasQueFaltam(resumo.diasDeTesteRestantes)}</Chip>
      ) : (
        <Chip tamanho="pequeno" tom="neutro">Grátis</Chip>
      );
    case "ativa":
      return <Chip tamanho="pequeno" tom="ok">{nomeDoPlano(resumo)}</Chip>;
    case "em_atraso":
      return <Chip tamanho="pequeno" tom="atencao">Pagamento pendente</Chip>;
    case "cancelada":
    case "gratis":
      return <Chip tamanho="pequeno" tom="neutro">Grátis</Chip>;
  }
}

export function Assinatura({
  agora = new Date(),
  intervaloDeConsulta = 2000,
}: {
  agora?: Date;
  intervaloDeConsulta?: number;
}) {
  const { nomeDaBarbearia, slug } = usePainel();
  const { resumo, recarregar } = useAssinatura();
  const voltouDoCheckout = useSearchParams().get("ok") === "1";
  const [consultas, setConsultas] = useState(0);

  // Voltou do Checkout e o webhook ainda não chegou: consulta de novo,
  // com limite.
  const esperandoAStripe = voltouDoCheckout && resumo !== null && !temPlanoPago(resumo);
  useEffect(() => {
    if (!esperandoAStripe || consultas >= CONSULTAS_NA_VOLTA) return;
    const espera = setTimeout(() => {
      setConsultas((n) => n + 1);
      recarregar();
    }, intervaloDeConsulta);
    return () => clearTimeout(espera);
  }, [esperandoAStripe, consultas, intervaloDeConsulta, recarregar]);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Plano"
        apoio={nomeDaBarbearia ?? slug}
        selo={resumo ? seloDaSituacao(resumo) : null}
      />

      {esperandoAStripe ? (
        <Aviso tom="sucesso">
          {consultas >= CONSULTAS_NA_VOLTA
            ? "Pagamento recebido. A confirmação da Stripe está demorando: atualize a página em alguns minutos."
            : "Pagamento recebido. Confirmando com a Stripe…"}
        </Aviso>
      ) : null}

      {resumo === null ? (
        <PerguntasFrequentes />
      ) : temPlanoPago(resumo) ? (
        <PlanoAtual resumo={resumo}>
          <PerguntasFrequentes />
        </PlanoAtual>
      ) : (
        <Configurador resumo={resumo} agora={agora}>
          <PerguntasFrequentes />
        </Configurador>
      )}
    </div>
  );
}

// Com plano pago: o que vale, quando cobra, e o Portal pra mudar. As
// perguntas (`children`) ficam na coluna da esquerda no desktop.
function PlanoAtual({ resumo, children }: { resumo: ResumoDaAssinatura; children: ReactNode }) {
  const frase = fraseDaCobranca(resumo);
  const contratados = resumo.profissionais;

  return (
    <div className={estilos.corpo}>
      <div className={estilos.coluna}>{children}</div>
      <section className={estilos.cartao} aria-labelledby="plano-atual">
        <div className={estilos.topoDoCartao}>
          <div>
            <h2 id="plano-atual" className={estilos.nomeDoPlano}>
              {nomeDoPlano(resumo)} {resumo.ciclo === "anual" ? "anual" : "mensal"}
            </h2>
            <p className={estilos.apoio}>Equipe de {profissionais(contratados)}</p>
          </div>
          {frase ? <p className={estilos.cobranca}>{frase}</p> : null}
        </div>

        {resumo.situacao === "em_atraso" ? (
          <Aviso tom="atencao">
            A Stripe não conseguiu cobrar. Atualize o cartão para não perder o plano; enquanto ela tenta de novo,
            tudo continua funcionando.
          </Aviso>
        ) : null}

        <BotaoDoPortal />
        <p className={estilos.rodape}>
          Trocar de plano ou de ciclo, atualizar o cartão, ver as faturas e cancelar: tudo na página segura da Stripe.
        </p>
      </section>
    </div>
  );
}

function BotaoDoPortal() {
  const api = useApiDoPainel();
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAbrindo(true);
    setErro(null);
    try {
      irParaAStripe((await api.barbeiro.portalDaAssinatura()).url);
    } catch (causa) {
      setAbrindo(false);
      setErro(causa instanceof ErroDaApi ? causa.message : "Não deu para abrir a Stripe. Tente de novo.");
    }
  }

  return (
    <>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao onClick={abrir} carregando={abrindo}>
        Gerenciar pagamento e faturas
      </Botao>
    </>
  );
}

// Sem plano pago (teste, Grátis ou cancelada): escolher e assinar. Os
// controles e as perguntas (`children`) dividem a coluna da esquerda no
// desktop; o cartão fica ao lado.
function Configurador({
  resumo,
  agora,
  children,
}: {
  resumo: ResumoDaAssinatura;
  agora: Date;
  children: ReactNode;
}) {
  const api = useApiDoPainel();
  const equipe = Math.max(1, resumo.profissionais);
  const cabeNoEssencial = equipe <= (limiteDeProfissionais("essencial") ?? Infinity);
  const [plano, setPlano] = useState<PlanoPago>(
    resumo.plano !== "gratis" && (resumo.plano === "completo" || cabeNoEssencial)
      ? resumo.plano
      : cabeNoEssencial
        ? "essencial"
        : "completo"
  );
  const [ciclo, setCiclo] = useState<Ciclo>(resumo.ciclo);
  const [quantidade, setQuantidade] = useState(equipe);
  const [assinando, setAssinando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const limite = limiteDeProfissionais(plano);
  // Trocar pro Essencial com mais gente que o limite: a quantidade desce
  // até ele (nunca abaixo da equipe, que aí nem deixa escolher).
  const profissionaisNoPlano = limite === null ? quantidade : Math.min(quantidade, limite);
  const total = precoDoPlano(plano, ciclo, profissionaisNoPlano);
  const { base, extra } = precosDoCiclo(plano, ciclo);
  const porAno = ciclo === "anual" ? "ano" : "mês";
  const preco = `${formatarReais(total)}/${porAno}`;
  const nome = PLANOS[plano].nome;

  const anualDoMesmo = precoDoPlano(plano, "anual", profissionaisNoPlano);
  const mensalNoAno = precoDoPlano(plano, "mensal", profissionaisNoPlano) * 12;

  const fimDoTeste = resumo.situacao === "teste" ? resumo.testeTerminaEm : null;
  const cobraNoFimDoTeste =
    fimDoTeste !== null && new Date(fimDoTeste).getTime() - agora.getTime() >= FOLGA_DO_TESTE;

  async function assinar() {
    setAssinando(true);
    setErro(null);
    try {
      const { url } = await api.barbeiro.checkoutDaAssinatura({ plano, ciclo, profissionais: profissionaisNoPlano });
      irParaAStripe(url);
    } catch (causa) {
      setAssinando(false);
      setErro(causa instanceof ErroDaApi ? causa.message : "Não deu para abrir a Stripe. Tente de novo.");
    }
  }

  return (
    <div className={estilos.corpo}>
      <div className={estilos.coluna}>
        <div className={estilos.controles}>
          <SeletorEmPilulas<PlanoPago>
            nome="plano"
            legenda="Plano"
            valor={plano}
            aoTrocar={setPlano}
            opcoes={[
              { valor: "essencial", rotulo: "Essencial", desligada: !cabeNoEssencial },
              { valor: "completo", rotulo: "Completo" },
            ]}
          />

          <div className={estilos.contador}>
            <span id="rotulo-profissionais" className={estilos.legenda}>
              Profissionais
            </span>
            <div className={estilos.passos}>
              <button
                type="button"
                className={estilos.passo}
                aria-label="Menos um profissional"
                disabled={profissionaisNoPlano <= equipe}
                onClick={() => setQuantidade(profissionaisNoPlano - 1)}
              >
                −
              </button>
              <output className={estilos.quantidade} aria-labelledby="rotulo-profissionais" aria-live="polite">
                {profissionaisNoPlano}
              </output>
              <button
                type="button"
                className={estilos.passo}
                aria-label="Mais um profissional"
                disabled={limite !== null && profissionaisNoPlano >= limite}
                onClick={() => setQuantidade(profissionaisNoPlano + 1)}
              >
                +
              </button>
            </div>
            {limite !== null && profissionaisNoPlano >= limite ? (
              <p className={estilos.dica}>
                O {nome} vai até {profissionais(limite)}. Para uma equipe maior, escolha o Completo.
              </p>
            ) : equipe > 1 && profissionaisNoPlano === equipe ? (
              <p className={estilos.dica}>Sua equipe tem {profissionais(equipe)}: o plano começa daí.</p>
            ) : null}
          </div>

          <SeletorEmPilulas<Ciclo>
            nome="ciclo"
            legenda="Ciclo de cobrança"
            valor={ciclo}
            aoTrocar={setCiclo}
            opcoes={[
              { valor: "mensal", rotulo: "Mensal" },
              { valor: "anual", rotulo: "Anual", selo: "2 meses grátis" },
            ]}
          />
        </div>
        {children}
      </div>

      <section className={estilos.cartao} aria-labelledby="plano-escolhido">
        <div className={estilos.topoDoCartao}>
          <div>
            <h2 id="plano-escolhido" className={estilos.nomeDoPlano}>
              {nome}
            </h2>
            <p className={estilos.apoio}>Para {profissionais(profissionaisNoPlano)}</p>
          </div>
          <div className={estilos.valores}>
            <p className={estilos.preco} data-testid="preco-do-plano">
              <span className={estilos.valor}>{formatarReais(total)}</span>
              <span className={estilos.unidade}>/{porAno}</span>
            </p>
            {ciclo === "anual" ? (
              <p className={estilos.economia}>Você economiza {formatarReais(mensalNoAno - total)} por ano</p>
            ) : (
              <p className={estilos.apoio}>No anual sairia por {formatarReais(anualDoMesmo)} por ano: 2 meses grátis</p>
            )}
          </div>
        </div>

        <dl className={estilos.conta}>
          <div className={estilos.linhaDaConta}>
            <dt>Base · 1 profissional incluso</dt>
            <dd>{formatarReais(base)}</dd>
          </div>
          {profissionaisNoPlano > 1 ? (
            <div className={estilos.linhaDaConta}>
              <dt>
                {profissionaisNoPlano - 1} × {formatarReais(extra)}
              </dt>
              <dd>{formatarReais((profissionaisNoPlano - 1) * extra)}</dd>
            </div>
          ) : null}
        </dl>

        <div className={estilos.colunas}>
          <div>
            <h3 className={estilos.subtitulo}>Vem no plano</h3>
            <ul className={estilos.lista}>
              <li>Agenda, link de agendamento e painel inteiros</li>
              <li>{limite === null ? "Profissionais sem limite" : `Até ${profissionais(limite)}`}</li>
              <li>Em breve: {recursosEmBreve(plano)}</li>
            </ul>
          </div>
          <div>
            <h3 className={estilos.subtitulo}>Como você paga</h3>
            <p className={estilos.pagamento}>
              <strong>Cartão de crédito</strong>
              <br />
              Você termina na página segura da Stripe. O BarChop não vê o número do cartão.
            </p>
          </div>
        </div>

        <p className={estilos.cobrancaDoTeste}>
          {cobraNoFimDoTeste
            ? `A 1ª cobrança é só em ${diaEMes(fimDoTeste!)}, quando o teste acaba. O ${nome} vale assim que você assinar.`
            : "A cobrança é feita na hora, e o plano vale assim que você assinar."}
        </p>

        {erro ? <Aviso>{erro}</Aviso> : null}
        <Botao onClick={assinar} carregando={assinando}>
          Assinar o {nome} · {preco}
        </Botao>
        <p className={estilos.rodape}>Cartão via Stripe · sem fidelidade, cancele quando quiser</p>
      </section>
    </div>
  );
}

const PERGUNTAS: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "Quando a assinatura começa a cobrar?",
    resposta:
      "Se você assinar durante o teste, a 1ª cobrança é só no fim dele, e o plano escolhido já vale na hora. Depois, a cobrança se repete na mesma data, todo mês ou todo ano.",
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta:
      "Sim, sem multa, em Gerenciar pagamento e faturas. O plano vale até o fim do período já pago; depois, a barbearia volta para o Grátis sem perder nada.",
  },
  {
    pergunta: "Qual a diferença entre mensal e anual?",
    resposta: "No anual você paga 10 meses e leva 12: dois meses grátis, cobrados de uma vez.",
  },
  {
    pergunta: "O que acontece se o pagamento falhar?",
    resposta:
      "A Stripe tenta cobrar de novo nos dias seguintes e o painel avisa. Enquanto isso, tudo continua funcionando.",
  },
  {
    pergunta: "E se eu não assinar?",
    resposta:
      "No fim do teste a barbearia vai para o Grátis: só 1 profissional aparece no link, e nada é apagado. Você pode assinar quando quiser.",
  },
];

function PerguntasFrequentes() {
  return (
    <section className={estilos.perguntas} aria-labelledby="perguntas">
      <h2 id="perguntas" className={estilos.subtitulo}>
        Perguntas frequentes
      </h2>
      {PERGUNTAS.map(({ pergunta, resposta }) => (
        <details key={pergunta} className={estilos.pergunta}>
          <summary>{pergunta}</summary>
          <p>{resposta}</p>
        </details>
      ))}
    </section>
  );
}
