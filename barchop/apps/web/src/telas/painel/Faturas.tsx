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
} from "@barchop/formato";
import type { FaturaDaAssinatura, ResumoDaAssinatura } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao, BotaoLink } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import {
  DIAS_DO_AVISO_DO_PIX,
  diaEMes,
  estadoDoPix,
  fraseDaCobranca,
  nomeDoPlano,
  periodoDoCiclo,
  profissionais,
  temPlanoPago,
  type EstadoDoPix,
} from "../../painel/assinatura";
import { useAssinatura } from "../../painel/ProvedorDaAssinatura";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { irParaAStripe } from "../../painel/stripe";
import { PixDoPedido, PlanoNoPix, useCotacaoDoPix } from "./FaturasNoPix";
import estilos from "./Faturas.module.css";

// Faturas (Onda 2, marco 1, PR 5), no modelo da tela de assinatura do
// Barbeiro.app (Telas_Assinatura_BarbeiroApp.docx, 15/10/2026). Sem
// plano pago: Plano → Pagamento → Acesso liberado, com o Seu pedido ao
// lado e o comparativo embaixo. Com plano pago: o plano e as faturas
// lidas da Stripe. Pagar, trocar de plano, trocar o cartão e cancelar é
// tudo na Stripe; aqui é o caminho até lá.

type PlanoPago = "essencial" | "completo";
type Etapa = "plano" | "pagamento";
type FormaDePagar = "cartao" | "pix";

const PLANOS_PAGOS: readonly PlanoPago[] = ["essencial", "completo"];

// A Stripe exige o fim do teste pelo menos 48h à frente; com menos, a
// API cobra na hora (fimDoTesteNaCobranca, em apps/api/src/lib/cobranca.ts).
const FOLGA_DO_TESTE = 48 * 60 * 60 * 1000 + 10 * 60 * 1000;

// Na volta do Checkout, o webhook costuma chegar em segundos; 15
// consultas de 2s cobrem o atraso comum sem consultar pra sempre.
const CONSULTAS_NA_VOLTA = 15;

const ETAPAS = ["Plano", "Pagamento", "Acesso liberado"] as const;

const DESCRICOES: Record<PlanoPago, { curta: string; longa: string }> = {
  essencial: {
    curta: "Até 3 profissionais",
    longa: "Agenda, link de agendamento e painel inteiros para a barbearia pequena.",
  },
  completo: {
    curta: "Equipe sem limite",
    longa: "Tudo do Essencial, para qualquer tamanho de equipe, e os recursos do Completo quando chegarem.",
  },
};

// O que cada plano promete. "Em breve" no que o BarChop ainda não tem: a
// tela não vende o que não existe (decisão 8 do plano da cobrança).
const VEM_NO_PLANO: Record<PlanoPago, string[]> = {
  essencial: ["Agenda, link de agendamento e painel", "Até 3 profissionais", "Caixa e relatórios (em breve)"],
  completo: [
    "Agenda, link de agendamento e painel",
    "Profissionais sem limite",
    "Caixa e relatórios completos (em breve)",
    "WhatsApp e planos para os seus clientes (em breve)",
  ],
};

// O comparativo recurso por recurso. Os limites e os preços saem de
// planos.ts; o resto descreve o que `recursos` de cada plano libera.
const LINHAS_DO_COMPARATIVO: { recurso: string; valores: [string, string, string] }[] = [
  { recurso: "Agenda, link e painel", valores: ["✓", "✓", "✓"] },
  { recurso: "Caixa (em breve)", valores: ["—", "✓", "✓"] },
  { recurso: "Relatórios (em breve)", valores: ["—", "Básicos", "Completos"] },
  { recurso: "WhatsApp (em breve)", valores: ["—", "—", "✓"] },
  { recurso: "Planos para os seus clientes (em breve)", valores: ["—", "—", "✓"] },
];

const GARANTIAS = [
  "Sem fidelidade, cancele quando quiser",
  "Troque de plano quando quiser",
  "Recibo em cada fatura",
  "Pagamento no cartão pela Stripe",
  "Cancelou? Nada é apagado",
];

// O selo do cartão do plano (onda C: saiu do título). Só com plano pago:
// em dia ou com o pagamento pendente. Cancelado no Portal não leva selo —
// a frase da cobrança já diz até quando vale.
function seloDoPlano(resumo: ResumoDaAssinatura) {
  if (resumo.situacao === "em_atraso") {
    return (
      <Chip tamanho="pequeno" tom="atencao">
        Pagamento pendente
      </Chip>
    );
  }
  if (resumo.situacao === "ativa" && !resumo.cancelaEm) {
    return (
      <Chip tamanho="pequeno" tom="ok">
        Em dia
      </Chip>
    );
  }
  return null;
}

function porCiclo(ciclo: Ciclo): string {
  return ciclo === "anual" ? "ano" : "mês";
}

export function Faturas({
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
  // Com o Pix, "Mudar plano ou profissionais" abre a escolha de novo.
  const [mudandoOPix, setMudandoOPix] = useState(false);
  const pix = resumo ? estadoDoPix(resumo, agora) : null;

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

  let conteudo: ReactNode = null;
  if (resumo !== null) {
    if (voltouDoCheckout) {
      conteudo = (
        <>
          <Trilha atual={2} />
          {esperandoAStripe ? (
            <Aviso tom="sucesso">
              {consultas >= CONSULTAS_NA_VOLTA
                ? "Pagamento recebido. A confirmação da Stripe está demorando: atualize a página em alguns minutos."
                : "Pagamento recebido. Confirmando com a Stripe…"}
            </Aviso>
          ) : (
            <AcessoLiberado resumo={resumo} />
          )}
        </>
      );
    } else if (pix && mudandoOPix) {
      conteudo = (
        <Assinar
          resumo={resumo}
          agora={agora}
          soPix
          aoVoltar={() => setMudandoOPix(false)}
          aoPagar={() => setMudandoOPix(false)}
        />
      );
    } else if (pix) {
      conteudo = <PlanoNoPix resumo={resumo} estado={pix} agora={agora} aoMudar={() => setMudandoOPix(true)} />;
    } else if (temPlanoPago(resumo)) {
      conteudo = <ComPlanoPago resumo={resumo} />;
    } else {
      conteudo = <Assinar resumo={resumo} agora={agora} />;
    }
  }

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Faturas"
        apoio={apoioDaPagina(resumo, nomeDaBarbearia ?? slug, pix)}
      />
      {conteudo}
    </div>
  );
}

// O apoio do título. Sem plano pago, diz em que pé a barbearia está: o
// teste até quando, ou o Grátis com o limite do link. Com plano, o nome.
// Com o Pix, o que o canvas pede em cada momento.
function apoioDaPagina(
  resumo: ResumoDaAssinatura | null,
  nome: string | null | undefined,
  pix: EstadoDoPix | null
): string | undefined {
  const barbearia = nome ?? undefined;
  if (!resumo) return barbearia;
  if (pix === "renovar") {
    return `O Pix não renova sozinho: cada ${periodoDoCiclo(resumo.ciclo)} é um Pix novo, com o valor certo.`;
  }
  if (pix === "vencido") {
    return `Só ${profissionais(resumo.limiteDeProfissionais ?? 1)} aparece no link. Pague pra voltar com a equipe toda.`;
  }
  if (pix) {
    return barbearia ? `O plano da ${barbearia} e os pagamentos feitos.` : "O plano da barbearia e os pagamentos feitos.";
  }
  if (temPlanoPago(resumo)) {
    return barbearia ? `O plano e as cobranças da ${barbearia}.` : "O plano e as cobranças da barbearia.";
  }
  const daBarbearia = barbearia ? `da ${barbearia}` : "da barbearia";
  if (resumo.situacao === "teste" && resumo.diasDeTesteRestantes && resumo.testeTerminaEm) {
    return `Escolha o plano ${daBarbearia}. O teste grátis vai até ${diaEMes(resumo.testeTerminaEm)}.`;
  }
  const quem = barbearia ? `A ${barbearia}` : "A barbearia";
  const limite =
    resumo.limiteDeProfissionais !== null
      ? `: só ${profissionais(resumo.limiteDeProfissionais)} aparece no link`
      : "";
  return `${quem} está no Grátis${limite}. Escolha um plano pra voltar com a equipe toda.`;
}

function Trilha({ atual }: { atual: number }) {
  return (
    <ol className={estilos.trilha} aria-label="Etapas da assinatura">
      {ETAPAS.map((nome, indice) => (
        <li
          key={nome}
          className={estilos.passoDaTrilha}
          aria-current={indice === atual ? "step" : undefined}
          data-feita={indice < atual || undefined}
        >
          <span className={estilos.numeroDaTrilha} aria-hidden="true">
            {indice < atual ? "✓" : indice + 1}
          </span>
          {nome}
        </li>
      ))}
    </ol>
  );
}

// Sem plano pago (teste, Grátis ou cancelada): escolher, pagar e voltar
// com o acesso liberado. `soPix`: com o Pix vigente, mudar de plano é
// pagar o próximo período por Pix (o cartão espera o Pix acabar).
function Assinar({
  resumo,
  agora,
  soPix = false,
  aoVoltar,
  aoPagar,
}: {
  resumo: ResumoDaAssinatura;
  agora: Date;
  soPix?: boolean;
  aoVoltar?: () => void;
  aoPagar?: () => void;
}) {
  const api = useApiDoPainel();
  const [forma, setForma] = useState<FormaDePagar>(soPix ? "pix" : "cartao");
  const recusa = soPix ? null : resumo.pix.ultimaRecusa;
  const equipe = Math.max(1, resumo.profissionais);
  const cabeNoEssencial = equipe <= (limiteDeProfissionais("essencial") ?? Infinity);
  const recomendado: PlanoPago = cabeNoEssencial ? "essencial" : "completo";
  const [etapa, setEtapa] = useState<Etapa>("plano");
  const [plano, setPlano] = useState<PlanoPago>(
    resumo.plano !== "gratis" && (resumo.plano === "completo" || cabeNoEssencial) ? resumo.plano : recomendado
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
  const nome = PLANOS[plano].nome;

  const fimDoTeste = resumo.situacao === "teste" ? resumo.testeTerminaEm : null;
  const cobraNoFimDoTeste =
    fimDoTeste !== null && new Date(fimDoTeste).getTime() - agora.getTime() >= FOLGA_DO_TESTE;
  const hoje = cobraNoFimDoTeste ? 0 : total;
  const noGratis = resumo.situacao !== "teste" || !resumo.diasDeTesteRestantes;

  const pedido = { plano, ciclo, profissionais: profissionaisNoPlano };
  // Só no Pagamento: a cotação também diz se o Pix está ligado na API.
  const cotacao = useCotacaoDoPix(etapa === "pagamento" ? pedido : null);
  const pixNoPedido = etapa === "pagamento" && forma === "pix";
  const cotado = cotacao.tipo === "ok" ? cotacao.cotacao : null;

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
    <>
      {aoVoltar ? (
        <div className={estilos.mudarPlano}>
          <Botao variante="fantasma" onClick={aoVoltar}>
            ← Voltar ao plano
          </Botao>
        </div>
      ) : null}
      {recusa && etapa === "plano" ? (
        <Recusa
          resposta={recusa.resposta}
          nadaApagado={noGratis}
          aoPagarDeNovo={() => {
            setForma("pix");
            setEtapa("pagamento");
          }}
        />
      ) : null}
      <Trilha atual={etapa === "plano" ? 0 : 1} />
      <div className={estilos.corpo}>
        <div className={estilos.etapa}>
          {etapa === "plano" ? (
            <EscolhaDoPlano
              resumo={resumo}
              recomendado={recomendado}
              cabeNoEssencial={cabeNoEssencial}
              equipe={equipe}
              plano={plano}
              aoTrocarPlano={setPlano}
              ciclo={ciclo}
              aoTrocarCiclo={setCiclo}
              profissionaisNoPlano={profissionaisNoPlano}
              aoTrocarQuantidade={setQuantidade}
              aoContinuar={() => setEtapa("pagamento")}
            />
          ) : (
            <section className={estilos.cartao} aria-labelledby="como-pagar">
              {/* Canvas Pix-Pagar: o voltar fica acima do título. */}
              <div className={estilos.mudarPlano}>
                <Botao variante="fantasma" onClick={() => setEtapa("plano")}>
                  ← Mudar plano
                </Botao>
              </div>
              <h2 id="como-pagar" className={estilos.tituloDaEtapa}>
                {soPix ? "Pagar por Pix" : "Como você prefere pagar?"}
              </h2>
              {soPix ? null : (
                <SeletorEmPilulas<FormaDePagar | "boleto">
                  nome="pagamento"
                  legenda="Forma de pagamento"
                  valor={forma}
                  aoTrocar={(valor) => {
                    if (valor !== "boleto") setForma(valor);
                  }}
                  opcoes={[
                    { valor: "cartao", rotulo: "Cartão", selo: "Renova sozinho" },
                    // Ligado quando a API cota: sem as variáveis do Pix
                    // (ou ainda perguntando), segue em breve.
                    {
                      valor: "pix",
                      rotulo: "Pix",
                      desligada: cotacao.tipo === "carregando" || cotacao.tipo === "desligado",
                      selo: cotacao.tipo === "ok" || cotacao.tipo === "erro" ? "Acesso na hora" : "Em breve",
                    },
                    { valor: "boleto", rotulo: "Boleto", desligada: true, selo: "Em breve" },
                  ]}
                />
              )}
              {forma === "pix" ? (
                <PixDoPedido
                  pedido={pedido}
                  cotacao={cotacao}
                  agora={agora}
                  titulo="Pague por Pix"
                  comPassos
                  aoPagar={aoPagar}
                />
              ) : (
                <>
                  <p className={estilos.apoio}>
                    Você termina na página segura da Stripe. Renovação automática no cartão; o BarChop não vê o
                    número dele.
                  </p>
                  {erro ? <Aviso>{erro}</Aviso> : null}
                  <Botao onClick={assinar} carregando={assinando}>
                    Assinar o {nome} · {formatarReais(hoje)} hoje
                  </Botao>
                  <p className={estilos.rodape}>
                    {cobraNoFimDoTeste
                      ? `Hoje ${formatarReais(0)} · a partir de ${diaEMes(fimDoTeste!)}, ${formatarReais(total)}/${porCiclo(ciclo)} · o ${nome} vale assim que você assinar · cancele quando quiser`
                      : `${formatarReais(total)} hoje · renova a cada ${porCiclo(ciclo)} · cancele quando quiser`}
                  </p>
                </>
              )}
            </section>
          )}
        </div>

        <div className={estilos.lado}>
          <SeuPedido
            plano={plano}
            ciclo={ciclo}
            profissionais={profissionaisNoPlano}
            total={total}
            hoje={pixNoPedido ? (cotado?.valorCentavos ?? total) : hoje}
            cobraEm={cobraNoFimDoTeste && !pixNoPedido ? fimDoTeste : null}
            porPix={pixNoPedido ? { venceEm: cotado?.periodoTerminaEm ?? null } : null}
            aoTrocarParaAnual={() => setCiclo("anual")}
          />
          {noGratis && !(recusa && etapa === "plano") ? (
            <p className={estilos.nadaApagado}>
              <strong>Nada foi apagado.</strong> A agenda, os clientes e o histórico continuam guardados. Assinar
              devolve tudo no mesmo estado.
            </p>
          ) : null}
        </div>

        <div className={estilos.resto}>
          <Comparativo plano={plano} />
          <PerguntasFrequentes />
        </div>
      </div>
    </>
  );
}

function EscolhaDoPlano({
  resumo,
  recomendado,
  cabeNoEssencial,
  equipe,
  plano,
  aoTrocarPlano,
  ciclo,
  aoTrocarCiclo,
  profissionaisNoPlano,
  aoTrocarQuantidade,
  aoContinuar,
}: {
  resumo: ResumoDaAssinatura;
  recomendado: PlanoPago;
  cabeNoEssencial: boolean;
  equipe: number;
  plano: PlanoPago;
  aoTrocarPlano: (plano: PlanoPago) => void;
  ciclo: Ciclo;
  aoTrocarCiclo: (ciclo: Ciclo) => void;
  profissionaisNoPlano: number;
  aoTrocarQuantidade: (quantidade: number) => void;
  aoContinuar: () => void;
}) {
  const limite = limiteDeProfissionais(plano);
  const total = precoDoPlano(plano, ciclo, profissionaisNoPlano);
  const { base, extra } = precosDoCiclo(plano, ciclo);
  const nome = PLANOS[plano].nome;
  const mensalNoAno = precoDoPlano(plano, "mensal", profissionaisNoPlano) * 12;
  const outro: PlanoPago = plano === "essencial" ? "completo" : "essencial";
  const uso = resumo.usoNoTeste;

  return (
    <>
      <fieldset className={estilos.planos}>
        <legend className={estilos.tituloDaEtapa}>
          Escolha o plano <span className={estilos.apoio}>Toque em um para ver o preço e o que vem.</span>
        </legend>
        <div className={estilos.cartoesDosPlanos}>
          {PLANOS_PAGOS.map((id) => (
            <label key={id} className={estilos.cartaoDoPlano}>
              <input
                type="radio"
                name="plano"
                value={id}
                checked={plano === id}
                disabled={id === "essencial" && !cabeNoEssencial}
                onChange={() => aoTrocarPlano(id)}
                className={estilos.radioDoPlano}
              />
              <span className={estilos.nomeNoCartao}>
                {PLANOS[id].nome}
                {id === recomendado ? <span className={estilos.recomendado}>Recomendado</span> : null}
              </span>
              <span className={estilos.precoNoCartao}>
                {formatarReais(precoDoPlano(id, "mensal", 1))}
                <span className={estilos.unidade}>/mês</span>
              </span>
              <span className={estilos.apoio}>{DESCRICOES[id].curta}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className={estilos.cartao} aria-labelledby="plano-escolhido">
        {uso ? (
          <div className={estilos.recomendacao}>
            <p className={estilos.tituloDaRecomendacao}>Recomendado pelo seu uso no teste</p>
            <p className={estilos.uso} data-testid="uso-no-teste">
              No seu teste: {diaEMes(uso.desde)} a {diaEMes(uso.ate)} · Profissionais {equipe} · Agendamentos{" "}
              {uso.agendamentos} · Serviços {uso.servicos}
            </p>
          </div>
        ) : null}

        <div className={estilos.topoDoCartao}>
          <div>
            <h2 id="plano-escolhido" className={estilos.nomeDoPlano}>
              {nome}
            </h2>
            <p className={estilos.apoio}>{DESCRICOES[plano].longa}</p>
          </div>
          <div className={estilos.valores}>
            <p className={estilos.preco} data-testid="preco-do-plano">
              <span className={estilos.valor}>{formatarReais(total)}</span>
              <span className={estilos.unidade}>/{porCiclo(ciclo)}</span>
            </p>
            {ciclo === "anual" ? (
              <p className={estilos.economia}>Você economiza {formatarReais(mensalNoAno - total)} por ano</p>
            ) : (
              <p className={estilos.apoio}>Sem fidelidade</p>
            )}
          </div>
        </div>

        <div className={estilos.controles}>
          <SeletorEmPilulas<Ciclo>
            nome="ciclo"
            legenda="Cobrança"
            valor={ciclo}
            aoTrocar={aoTrocarCiclo}
            opcoes={[
              { valor: "mensal", rotulo: "Mensal" },
              { valor: "anual", rotulo: "Anual", selo: "2 meses grátis" },
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
                onClick={() => aoTrocarQuantidade(profissionaisNoPlano - 1)}
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
                onClick={() => aoTrocarQuantidade(profissionaisNoPlano + 1)}
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
            ) : (
              <p className={estilos.dica}>
                1 profissional incluso. Cada um a mais: +{formatarReais(extra)}/{porCiclo(ciclo)}.
              </p>
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
            <h3 className={estilos.subtitulo}>Vem no {nome}</h3>
            <ul className={estilos.lista}>
              {VEM_NO_PLANO[plano].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {plano === "essencial" ? (
            <div>
              <h3 className={estilos.subtitulo}>Só no {PLANOS[outro].nome}</h3>
              <ul className={`${estilos.lista} ${estilos.listaDoOutro}`}>
                {VEM_NO_PLANO[outro].slice(1).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <Botao onClick={aoContinuar}>
          Continuar com o {nome}
        </Botao>
      </section>
    </>
  );
}

// A recusa do Suporte (canvas Pix-Aguardando, recusado): a assinatura já
// voltou ao que era; a resposta fica até o próximo Pix.
function Recusa({
  resposta,
  nadaApagado,
  aoPagarDeNovo,
}: {
  resposta: string;
  nadaApagado: boolean;
  aoPagarDeNovo: () => void;
}) {
  return (
    <section className={estilos.cartao} aria-labelledby="pix-nao-encontrado">
      <h2 id="pix-nao-encontrado" className={estilos.tituloDaEtapa}>
        Pix não encontrado
      </h2>
      <figure className={estilos.resposta}>
        <figcaption className={estilos.quemResponde}>Resposta do suporte do BarChop</figcaption>
        <blockquote className={estilos.textoDaResposta}>{resposta}</blockquote>
      </figure>
      {nadaApagado ? (
        <p className={estilos.nadaApagado}>
          <strong>Nada foi apagado.</strong> A agenda, os clientes e o histórico continuam guardados. Pagar devolve a
          equipe toda ao link.
        </p>
      ) : null}
      <div className={estilos.botoesDoPix}>
        <Botao onClick={aoPagarDeNovo}>Pagar com Pix de novo</Botao>
        <BotaoLink href="/painel/ajuda" variante="contorno">
          Falar com o suporte
        </BotaoLink>
      </div>
    </section>
  );
}

function SeuPedido({
  plano,
  ciclo,
  profissionais: quantos,
  total,
  hoje,
  cobraEm,
  porPix,
  aoTrocarParaAnual,
}: {
  plano: PlanoPago;
  ciclo: Ciclo;
  profissionais: number;
  total: number;
  hoje: number;
  cobraEm: string | null;
  // Pagando por Pix: não renova sozinho, vence (a data sai da cotação).
  porPix: { venceEm: string | null } | null;
  aoTrocarParaAnual: () => void;
}) {
  const anual = precoDoPlano(plano, "anual", quantos);
  const mensalNoAno = precoDoPlano(plano, "mensal", quantos) * 12;
  return (
    <aside className={estilos.pedido} aria-label="Seu pedido">
      <p className={estilos.subtitulo}>Seu pedido</p>
      <dl className={estilos.linhasDoPedido}>
        <div className={estilos.linhaDaConta}>
          <dt>Plano</dt>
          <dd>{PLANOS[plano].nome}</dd>
        </div>
        <div className={estilos.linhaDaConta}>
          <dt>Profissionais</dt>
          <dd>{profissionais(quantos)}</dd>
        </div>
        <div className={estilos.linhaDaConta}>
          <dt>Cobrança</dt>
          <dd>
            {ciclo === "anual" ? "Anual" : "Mensal"}
            {porPix ? ", por Pix" : ""}
          </dd>
        </div>
      </dl>
      <div className={estilos.hoje}>
        <span>Hoje</span>
        <strong className={estilos.valor} data-testid="hoje">
          {formatarReais(hoje)}
        </strong>
      </div>
      <p className={estilos.depois}>
        {porPix
          ? porPix.venceEm
            ? `vence em ${diaEMes(porPix.venceEm)} · avisamos ${DIAS_DO_AVISO_DO_PIX} dias antes`
            : "não renova sozinho: cada período é um Pix novo"
          : cobraEm
            ? `depois ${formatarReais(total)}/${porCiclo(ciclo)} a partir de ${diaEMes(cobraEm)}`
            : `renova a cada ${porCiclo(ciclo)}`}
      </p>
      {ciclo === "mensal" ? (
        <p className={estilos.apoio}>
          No anual sairia {formatarReais(anual)} por ano, {formatarReais(mensalNoAno - anual)} a menos.{" "}
          <button type="button" className={estilos.trocar} aria-label="Trocar para o anual" onClick={aoTrocarParaAnual}>
            Trocar
          </button>
        </p>
      ) : null}
    </aside>
  );
}

type IdNoComparativo = "gratis" | "essencial" | "completo";
const NO_COMPARATIVO: readonly IdNoComparativo[] = ["gratis", "essencial", "completo"];

function limiteNoComparativo(id: IdNoComparativo): string {
  const valor = limiteDeProfissionais(id);
  if (valor === null) return "Sem limite";
  return id === "gratis" ? String(valor) : `Até ${valor}`;
}

function Comparativo({ plano }: { plano: PlanoPago }) {
  const destaque = (id: IdNoComparativo) => (id === plano ? estilos.colunaEscolhida : undefined);
  // Fechado num acordeão, como as perguntas (17/10): a tabela repetia o
  // que os dois cartões já dizem, e quem quer comparar abre.
  return (
    <details className={`${estilos.comparativo} ${estilos.perguntas}`}>
      <summary className={estilos.resumoDasPerguntas}>Comparar planos</summary>
      <div className={estilos.rolagemDaTabela}>
        <table className={estilos.tabela}>
          <caption className={estilos.legendaDaTabela}>Comparar planos</caption>
          <thead>
            <tr>
              <th scope="col">Recurso</th>
              {NO_COMPARATIVO.map((id) => (
                <th key={id} scope="col" className={destaque(id)}>
                  {PLANOS[id].nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Profissionais</th>
              {NO_COMPARATIVO.map((id) => (
                <td key={id} className={destaque(id)}>
                  {limiteNoComparativo(id)}
                </td>
              ))}
            </tr>
            {LINHAS_DO_COMPARATIVO.map((linha) => (
              <tr key={linha.recurso}>
                <th scope="row">{linha.recurso}</th>
                {linha.valores.map((valor, indice) => (
                  <td key={NO_COMPARATIVO[indice]} className={destaque(NO_COMPARATIVO[indice])}>
                    {valor}
                  </td>
                ))}
              </tr>
            ))}
            <tr className={estilos.linhaDoPreco}>
              <th scope="row">Por mês</th>
              {NO_COMPARATIVO.map((id) => (
                <td key={id} className={destaque(id)}>
                  {formatarReais(id === "gratis" ? 0 : precoDoPlano(id, "mensal", 1))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ul className={estilos.garantias}>
        {GARANTIAS.map((garantia) => (
          <li key={garantia}>{garantia}</li>
        ))}
      </ul>
    </details>
  );
}

// A volta do Checkout depois que a Stripe confirmou.
function AcessoLiberado({ resumo }: { resumo: ResumoDaAssinatura }) {
  const frase = fraseDaCobranca(resumo);
  return (
    <section className={estilos.liberado} aria-labelledby="acesso-liberado">
      <span className={estilos.marcaDoLiberado} aria-hidden="true">
        ✓
      </span>
      <h2 id="acesso-liberado" className={estilos.tituloDaEtapa}>
        Acesso liberado
      </h2>
      <p className={estilos.apoio}>
        O {nomeDoPlano(resumo)} {resumo.ciclo === "anual" ? "anual" : "mensal"} está ativo para{" "}
        {profissionais(resumo.profissionais)}.{frase ? ` ${frase}.` : ""}
      </p>
      <div className={estilos.acoes}>
        <BotaoLink href="/painel/faturas">Ver faturas</BotaoLink>
        <BotaoLink href="/painel/agenda" variante="contorno">
          Ir para a agenda
        </BotaoLink>
      </div>
    </section>
  );
}

// Com plano pago: as faturas à esquerda, o plano (e o Portal) ao lado.
function ComPlanoPago({ resumo }: { resumo: ResumoDaAssinatura }) {
  return (
    <div className={`${estilos.corpo} ${estilos.pago}`}>
      <div className={estilos.etapa}>
        <ListaDeFaturas />
      </div>
      <div className={estilos.lado}>
        <PlanoAtual resumo={resumo} />
      </div>
      <div className={estilos.resto}>
        <PerguntasFrequentes />
      </div>
    </div>
  );
}

const ROTULO_DA_SITUACAO: Record<FaturaDaAssinatura["situacao"], string> = {
  paga: "Paga",
  aberta: "Em aberto",
  falhou: "Não paga",
  anulada: "Anulada",
  reembolsada: "Reembolsada",
  reembolsada_em_parte: "Reembolsada em parte",
};

// A cor do selo de cada situação: paga no verde, não paga no de atenção,
// o resto neutro.
const TOM_DA_SITUACAO: Record<FaturaDaAssinatura["situacao"] | "teste", "ok" | "atencao" | "neutro"> = {
  paga: "ok",
  aberta: "atencao",
  falhou: "atencao",
  anulada: "neutro",
  reembolsada: "neutro",
  reembolsada_em_parte: "neutro",
  teste: "neutro",
};

// Com recibo: a que foi paga, mesmo que o dinheiro tenha voltado depois.
const COM_RECIBO: ReadonlySet<FaturaDaAssinatura["situacao"]> = new Set([
  "paga",
  "reembolsada",
  "reembolsada_em_parte",
]);

function ListaDeFaturas() {
  const api = useApiDoPainel();
  const [faturas, setFaturas] = useState<FaturaDaAssinatura[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.barbeiro
      .faturasDaAssinatura()
      .then((lista) => {
        if (vivo) setFaturas(lista);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [api]);

  if (erro) return <Aviso>Não deu para carregar as faturas. Tente de novo em alguns minutos.</Aviso>;
  if (faturas === null) return null;
  if (faturas.length === 0) {
    return (
      <section className={estilos.faturas} aria-labelledby="titulo-faturas">
        <h2 id="titulo-faturas" className={estilos.legendaDaTabela}>
          Faturas
        </h2>
        <p className={estilos.apoio}>Nenhuma fatura ainda.</p>
      </section>
    );
  }
  // Em linhas, e não em tabela (onda C): no celular a tabela rolava de
  // lado; cada cobrança é um bloco com data e número, valor, situação e
  // a ação (recibo ou pagar).
  return (
    <section className={estilos.faturas} aria-labelledby="titulo-faturas">
      <h2 id="titulo-faturas" className={estilos.legendaDaTabela}>
        Cobranças
      </h2>
      <ul className={estilos.cobrancas} aria-labelledby="titulo-faturas">
        {faturas.map((fatura) => {
          const doTeste = fatura.situacao === "paga" && fatura.valorCentavos === 0;
          const pagar = (fatura.situacao === "aberta" || fatura.situacao === "falhou") && fatura.paginaUrl;
          return (
            <li key={fatura.id} className={estilos.linhaDaCobranca}>
              <span className={estilos.quando}>
                {diaEMes(fatura.emitidaEm)}
                {fatura.numero ? ` · ${fatura.numero}` : ""}
              </span>
              <span className={estilos.valorDaCobranca}>{formatarReais(fatura.valorCentavos)}</span>
              <span>
                <Chip tamanho="pequeno" tom={TOM_DA_SITUACAO[doTeste ? "teste" : fatura.situacao]}>
                  {doTeste ? "Sem cobrança (teste)" : ROTULO_DA_SITUACAO[fatura.situacao]}
                </Chip>
              </span>
              {fatura.pdfUrl && COM_RECIBO.has(fatura.situacao) ? (
                <a className={estilos.acaoDaCobranca} href={fatura.pdfUrl} target="_blank" rel="noreferrer">
                  Recibo (PDF)
                </a>
              ) : pagar ? (
                <a className={estilos.acaoDaCobranca} href={fatura.paginaUrl!} target="_blank" rel="noreferrer">
                  Pagar
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// O plano que vale, quando cobra, e o Portal pra mudar.
function PlanoAtual({ resumo }: { resumo: ResumoDaAssinatura }) {
  const frase = fraseDaCobranca(resumo);
  return (
    <section className={estilos.pedido} aria-labelledby="plano-atual">
      <div className={estilos.topoDoPlano}>
        <div>
          <p className={estilos.subtitulo}>Seu plano</p>
          <h2 id="plano-atual" className={estilos.nomeDoPlano}>
            {nomeDoPlano(resumo)} {resumo.ciclo === "anual" ? "anual" : "mensal"}
          </h2>
          <p className={estilos.apoio}>Equipe de {profissionais(resumo.profissionais)}</p>
        </div>
        {seloDoPlano(resumo)}
      </div>
      {frase ? <p className={estilos.cobranca}>{frase}</p> : null}

      {resumo.situacao === "em_atraso" ? (
        <Aviso tom="atencao">
          A Stripe não conseguiu cobrar. Atualize o cartão para não perder o plano; enquanto ela tenta de novo,
          tudo continua funcionando.
        </Aviso>
      ) : null}

      {/* Em atraso, o botão diz o que resolver; abre o mesmo Portal. */}
      {resumo.situacao === "em_atraso" ? (
        <BotaoDoPortal texto="Atualizar o cartão" />
      ) : (
        <BotaoDoPortal texto="Gerenciar assinatura" variante="contorno" />
      )}
      <p className={estilos.rodape}>
        Trocar de plano, trocar o cartão, ver as faturas antigas e cancelar: na página segura da Stripe.
      </p>
    </section>
  );
}

function BotaoDoPortal({ texto, variante }: { texto: string; variante?: "contorno" }) {
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
      <Botao onClick={abrir} carregando={abrindo} variante={variante}>
        {texto}
      </Botao>
    </>
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
      "Sim, sem multa, em Gerenciar assinatura. O plano vale até o fim do período já pago; depois, a barbearia volta para o Grátis sem perder nada.",
  },
  {
    pergunta: "Mudei de plano no meio do mês, quanto pago?",
    resposta:
      "Subiu de plano: paga na hora só a diferença pelos dias que faltam no período, e o plano novo já vale. Desceu de plano ou trocou o anual pelo mensal: a mudança vale no fim do período já pago, sem cobrança a mais. Durante o teste, trocar de plano não cobra nada.",
  },
  {
    pergunta: "Qual a diferença entre mensal e anual?",
    resposta: "No anual você paga 10 meses e leva 12: dois meses grátis, cobrados de uma vez.",
  },
  {
    pergunta: "Quais formas de pagamento são aceitas?",
    resposta: "Cartão de crédito, pelo Checkout da Stripe. Pix e boleto chegam em breve.",
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
    <details className={estilos.perguntas}>
      <summary className={estilos.resumoDasPerguntas}>Perguntas frequentes</summary>
      <dl className={estilos.listaDePerguntas}>
        {PERGUNTAS.map(({ pergunta, resposta }) => (
          <div key={pergunta} className={estilos.pergunta}>
            <dt>{pergunta}</dt>
            <dd>{resposta}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
