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
import estilos from "./Faturas.module.css";

// Faturas (Onda 2, marco 1, PR 5), no modelo da tela de assinatura do
// Barbeiro.app (Telas_Assinatura_BarbeiroApp.docx, 15/10/2026). Sem
// plano pago: Plano → Pagamento → Acesso liberado, com o Seu pedido ao
// lado e o comparativo embaixo. Com plano pago: o plano e as faturas
// lidas da Stripe. Pagar, trocar de plano, trocar o cartão e cancelar é
// tudo na Stripe; aqui é o caminho até lá.

type PlanoPago = "essencial" | "completo";
type Etapa = "plano" | "pagamento";

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

function seloDaSituacao(resumo: ResumoDaAssinatura) {
  switch (resumo.situacao) {
    case "teste":
      return resumo.diasDeTesteRestantes ? (
        <Chip tamanho="pequeno">Teste grátis · {diasQueFaltam(resumo.diasDeTesteRestantes)}</Chip>
      ) : (
        <Chip tamanho="pequeno" tom="neutro">
          Grátis
        </Chip>
      );
    case "ativa":
      return (
        <Chip tamanho="pequeno" tom="ok">
          {nomeDoPlano(resumo)}
        </Chip>
      );
    case "em_atraso":
      return (
        <Chip tamanho="pequeno" tom="atencao">
          Pagamento pendente
        </Chip>
      );
    case "cancelada":
    case "gratis":
      return (
        <Chip tamanho="pequeno" tom="neutro">
          Grátis
        </Chip>
      );
  }
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
        apoio={nomeDaBarbearia ?? slug}
        selo={resumo ? seloDaSituacao(resumo) : null}
      />
      {conteudo}
    </div>
  );
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
// com o acesso liberado.
function Assinar({ resumo, agora }: { resumo: ResumoDaAssinatura; agora: Date }) {
  const api = useApiDoPainel();
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
              <div className={estilos.topoDoCartao}>
                <h2 id="como-pagar" className={estilos.tituloDaEtapa}>
                  Como você prefere pagar?
                </h2>
                <Botao variante="fantasma" onClick={() => setEtapa("plano")}>
                  ← Mudar plano
                </Botao>
              </div>
              <SeletorEmPilulas<"cartao" | "pix" | "boleto">
                nome="pagamento"
                legenda="Forma de pagamento"
                valor="cartao"
                aoTrocar={() => {}}
                opcoes={[
                  { valor: "cartao", rotulo: "Cartão", selo: "Acesso na hora" },
                  { valor: "pix", rotulo: "Pix", desligada: true, selo: "Em breve" },
                  { valor: "boleto", rotulo: "Boleto", desligada: true, selo: "Em breve" },
                ]}
              />
              <p className={estilos.apoio}>
                Você termina na página segura da Stripe. Renovação automática no cartão; o BarChop não vê o número
                dele.
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
            </section>
          )}
        </div>

        <div className={estilos.lado}>
          <SeuPedido
            plano={plano}
            ciclo={ciclo}
            profissionais={profissionaisNoPlano}
            total={total}
            hoje={hoje}
            cobraEm={cobraNoFimDoTeste ? fimDoTeste : null}
            aoTrocarParaAnual={() => setCiclo("anual")}
          />
          {noGratis ? (
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
          Continuar com o {nome} · {formatarReais(total)}/{porCiclo(ciclo)}
        </Botao>
      </section>
    </>
  );
}

function SeuPedido({
  plano,
  ciclo,
  profissionais: quantos,
  total,
  hoje,
  cobraEm,
  aoTrocarParaAnual,
}: {
  plano: PlanoPago;
  ciclo: Ciclo;
  profissionais: number;
  total: number;
  hoje: number;
  cobraEm: string | null;
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
          <dd>{ciclo === "anual" ? "Anual" : "Mensal"}</dd>
        </div>
      </dl>
      <div className={estilos.hoje}>
        <span>Hoje</span>
        <strong className={estilos.valor} data-testid="hoje">
          {formatarReais(hoje)}
        </strong>
      </div>
      <p className={estilos.depois}>
        {cobraEm
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
  return (
    <section className={estilos.comparativo}>
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
    </section>
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
};

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
  return (
    <section className={estilos.faturas}>
      <div className={estilos.rolagemDaTabela}>
        <table className={estilos.tabela}>
          <caption className={estilos.legendaDaTabela}>Faturas</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Número</th>
              <th scope="col">Valor</th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className={estilos.soLeitor}>Arquivo</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((fatura) => {
              const doTeste = fatura.situacao === "paga" && fatura.valorCentavos === 0;
              const pagar = (fatura.situacao === "aberta" || fatura.situacao === "falhou") && fatura.paginaUrl;
              return (
                <tr key={fatura.id}>
                  <td>{diaEMes(fatura.emitidaEm)}</td>
                  <td>{fatura.numero ?? "—"}</td>
                  <td className={estilos.numero}>{formatarReais(fatura.valorCentavos)}</td>
                  <td data-situacao={fatura.situacao}>
                    {doTeste ? "Sem cobrança (teste)" : ROTULO_DA_SITUACAO[fatura.situacao]}
                  </td>
                  <td>
                    {fatura.pdfUrl && fatura.situacao === "paga" ? (
                      <a href={fatura.pdfUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    ) : pagar ? (
                      <a href={fatura.paginaUrl!} target="_blank" rel="noreferrer">
                        Pagar
                      </a>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// O plano que vale, quando cobra, e o Portal pra mudar.
function PlanoAtual({ resumo }: { resumo: ResumoDaAssinatura }) {
  const frase = fraseDaCobranca(resumo);
  return (
    <section className={estilos.pedido} aria-labelledby="plano-atual">
      <p className={estilos.subtitulo}>Seu plano</p>
      <h2 id="plano-atual" className={estilos.nomeDoPlano}>
        {nomeDoPlano(resumo)} {resumo.ciclo === "anual" ? "anual" : "mensal"}
      </h2>
      <p className={estilos.apoio}>Equipe de {profissionais(resumo.profissionais)}</p>
      {frase ? <p className={estilos.cobranca}>{frase}</p> : null}

      {resumo.situacao === "em_atraso" ? (
        <Aviso tom="atencao">
          A Stripe não conseguiu cobrar. Atualize o cartão para não perder o plano; enquanto ela tenta de novo,
          tudo continua funcionando.
        </Aviso>
      ) : null}

      <BotaoDoPortal />
      <p className={estilos.rodape}>
        Trocar de plano, trocar o cartão, ver as faturas antigas e cancelar: na página segura da Stripe.
      </p>
    </section>
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
        Gerenciar assinatura
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
