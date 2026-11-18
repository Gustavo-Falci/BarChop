"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ErroDaApi, type PedidoDeAssinatura } from "@barchop/api-client";
import { PLANOS, formatarReais, limiteDeProfissionais, precoDoPlano } from "@barchop/formato";
import type { CotacaoDoPix, MembroDaEquipe, PagamentoPix, ResumoDaAssinatura, SituacaoDoPix } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Chip } from "../../componentes/Chip";
import { CodigoQr } from "../../componentes/CodigoQr";
import { useRequisicao } from "../../api/useRequisicao";
import {
  DIAS_DO_AVISO_DO_PIX,
  emLista,
  diaEMes,
  nomeComCiclo,
  periodoDoCiclo,
  pontasDoPeriodo,
  profissionais,
  type EstadoDoPix,
} from "../../painel/assinatura";
import { useAssinatura } from "../../painel/ProvedorDaAssinatura";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { copiarLink } from "../../painel/compartilhar";
import estilos from "./Faturas.module.css";

// O Pix do BarChop em Faturas (plano pix-do-barchop, PR 2; canvas
// Pix-Pagar, Pix-Aguardando e Pix-Renovar). O BarChop gera o QR e o
// copia e cola com o valor exato (a API calcula, nunca a tela); o dono
// paga no banco e toca "Já paguei"; o plano vale na hora, aguardando a
// conferência do Suporte. Cada período é um Pix novo.

const UM_DIA = 24 * 60 * 60 * 1000;

const DIA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function diaEHora(instante: string): string {
  return DIA_E_HORA.format(new Date(instante));
}

// "Essencial mensal · 2 profissionais · vale de 15/11 a 15/12". Começa
// hoje (Grátis, teste vencido, Pix vencido): "vale de hoje, 10/11, a …".
export function descricaoDoPix(
  pedido: PedidoDeAssinatura,
  periodo: { periodoComecaEm: string; periodoTerminaEm: string },
  agora: Date
): string {
  const [comeca, termina] = pontasDoPeriodo(periodo.periodoComecaEm, periodo.periodoTerminaEm);
  const vale =
    diaEMes(periodo.periodoComecaEm) === diaEMes(agora.toISOString())
      ? `vale de hoje, ${comeca}, a ${termina}`
      : `vale de ${comeca} a ${termina}`;
  return `${nomeComCiclo(pedido.plano, pedido.ciclo)} · ${profissionais(pedido.profissionais)} · ${vale}`;
}

export type CotacaoNaTela =
  | { tipo: "carregando" }
  | { tipo: "desligado" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ok"; cotacao: CotacaoDoPix };

// A cotação do pedido. Sem pedido (o dono ainda escolhe o plano), nada
// é pedido. A resposta de um pedido antigo (trocou de plano no meio) não
// vale pro novo.
export function useCotacaoDoPix(pedido: PedidoDeAssinatura | null): CotacaoNaTela {
  const api = useApiDoPainel();
  const chave = pedido ? `${pedido.plano}|${pedido.ciclo}|${pedido.profissionais}` : null;
  const [resultado, setResultado] = useState<{ chave: string; valor: CotacaoNaTela } | null>(null);

  useEffect(() => {
    if (!chave) return;
    const [plano, ciclo, quantos] = chave.split("|");
    let vivo = true;
    api.barbeiro
      .cotacaoDoPix({
        plano: plano as PedidoDeAssinatura["plano"],
        ciclo: ciclo as PedidoDeAssinatura["ciclo"],
        profissionais: Number(quantos),
      })
      .then(
        (cotacao) => {
          if (vivo) setResultado({ chave, valor: { tipo: "ok", cotacao } });
        },
        (causa: unknown) => {
          if (!vivo) return;
          if (causa instanceof ErroDaApi && causa.codigo === "pix_desligado") {
            setResultado({ chave, valor: { tipo: "desligado" } });
          } else {
            setResultado({
              chave,
              valor: {
                tipo: "erro",
                mensagem: causa instanceof ErroDaApi ? causa.message : "Não deu para gerar o Pix. Tente de novo.",
              },
            });
          }
        }
      );
    return () => {
      vivo = false;
    };
  }, [api, chave]);

  if (!chave || !resultado || resultado.chave !== chave) return { tipo: "carregando" };
  return resultado.valor;
}

// O valor, o QR e o copia e cola. Com `titulo`, é uma região própria
// (o Pix do pagamento); sem, mora dentro do cartão de quem o mostra.
export function PixParaPagar({
  titulo,
  valorCentavos,
  descricao,
  copiaECola,
  recebedor,
  children,
}: {
  titulo?: string;
  valorCentavos: number;
  descricao: string;
  copiaECola: string;
  recebedor?: CotacaoDoPix["recebedor"];
  // Os passos e o "Já paguei", no mesmo bloco (canvas Pix-Pagar).
  children?: ReactNode;
}) {
  const id = useId();
  const [copiado, setCopiado] = useState<boolean | null>(null);
  const valor = formatarReais(valorCentavos);

  async function copiar() {
    setCopiado(await copiarLink(copiaECola));
  }

  const conteudo = (
    <>
      <div className={estilos.valorDoPix}>
        {titulo ? (
          <h3 id={`${id}-titulo`} className={estilos.subtitulo}>
            {titulo}
          </h3>
        ) : null}
        <strong className={estilos.valorGrande} data-testid="valor-do-pix">
          {valor}
        </strong>
        <span className={estilos.apoio}>{descricao}</span>
      </div>
      <CodigoQr texto={copiaECola} rotulo={`QR do Pix de ${valor}`} className={estilos.qrDoPix} />
      <div className={estilos.copiaECola}>
        <span id={`${id}-codigo`} className={estilos.legenda}>
          Ou copie o código Pix
        </span>
        <p aria-labelledby={`${id}-codigo`} className={estilos.codigoDoPix} data-testid="copia-e-cola">
          {copiaECola}
        </p>
        <Botao variante="contorno" onClick={copiar}>
          {copiado ? "Código copiado" : "Copiar código"}
        </Botao>
        <p role="status" className={estilos.dica}>
          {copiado === true
            ? "Cole no app do banco, na opção Pix copia e cola."
            : copiado === false
              ? "Não deu para copiar daqui: toque e segure o código pra copiar à mão."
              : ""}
        </p>
      </div>
      {recebedor ? (
        <p className={estilos.apoio}>
          Recebedor: <strong className={estilos.recebedor}>{recebedor.nome}</strong> · chave {recebedor.chaveMascarada}.
          Confira o nome antes de pagar.
        </p>
      ) : null}
      {children}
    </>
  );

  if (!titulo) return <div className={estilos.pix}>{conteudo}</div>;
  return (
    <section className={estilos.pix} aria-labelledby={`${id}-titulo`}>
      {conteudo}
    </section>
  );
}

const PASSOS = [
  "Abra o app do seu banco e escolha Pix.",
  "Leia o QR ou cole o código: o valor já vem certo.",
  "Volte aqui e toque em Já paguei.",
];

// Exportado: o Pix da diferença (plano profissional-novo-pago) mostra os
// mesmos passos.
export function PassosDoPix() {
  return (
    <ol className={estilos.passosDoPix}>
      {PASSOS.map((passo, indice) => (
        <li key={passo}>
          <span className={estilos.numeroDoPasso} aria-hidden="true">
            {indice + 1}
          </span>
          <span>{passo}</span>
        </li>
      ))}
    </ol>
  );
}

// "Já paguei": o pedido vai pra fila do Suporte e o plano vale na hora.
// A API recalcula o valor e o identificador; a tela só manda o pedido.
export function JaPaguei({
  pedido,
  comPassos = false,
  aoPagar,
}: {
  pedido: PedidoDeAssinatura;
  comPassos?: boolean;
  aoPagar?: () => void;
}) {
  const api = useApiDoPainel();
  const { recarregar } = useAssinatura();
  const [pagando, setPagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nome = PLANOS[pedido.plano].nome;

  async function pagar() {
    setPagando(true);
    setErro(null);
    try {
      await api.barbeiro.jaPagueiOPix(pedido);
      aoPagar?.();
      recarregar();
    } catch (causa) {
      setPagando(false);
      setErro(
        causa instanceof ErroDaApi
          ? `Não deu para registrar o pagamento: ${causa.message}.`
          : "Não deu para registrar o pagamento. Tente de novo."
      );
    }
  }

  return (
    <>
      {comPassos ? <PassosDoPix /> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao onClick={pagar} carregando={pagando}>
        Já paguei
      </Botao>
      <p className={estilos.rodape}>
        O {nome} vale na hora. O suporte do BarChop confere o Pix no extrato; se não achar, o plano volta ao que era
        antes e nada é apagado.
      </p>
    </>
  );
}

// O Pix do pedido, pela cotação: carregando, desligado, erro ou o QR.
export function PixDoPedido({
  pedido,
  cotacao,
  agora,
  titulo,
  comPassos,
  aoPagar,
}: {
  pedido: PedidoDeAssinatura;
  cotacao: CotacaoNaTela;
  agora: Date;
  titulo?: string;
  comPassos?: boolean;
  aoPagar?: () => void;
}) {
  if (cotacao.tipo === "carregando") return <p className={estilos.apoio}>Gerando o Pix…</p>;
  if (cotacao.tipo === "desligado") {
    return <Aviso tom="atencao">O pagamento por Pix está fora do ar agora. Tente de novo em alguns minutos.</Aviso>;
  }
  if (cotacao.tipo === "erro") return <Aviso>{cotacao.mensagem}</Aviso>;
  const { cotacao: c } = cotacao;
  return (
    <PixParaPagar
      titulo={titulo}
      valorCentavos={c.valorCentavos}
      descricao={descricaoDoPix(pedido, c, agora)}
      copiaECola={c.copiaECola}
      recebedor={c.recebedor}
    >
      <JaPaguei pedido={pedido} comPassos={comPassos} aoPagar={aoPagar} />
    </PixParaPagar>
  );
}

// Com o Pix: o plano que vale, o próximo Pix e os pagamentos feitos.
export function PlanoNoPix({
  resumo,
  estado,
  agora,
  aoMudar,
}: {
  resumo: ResumoDaAssinatura;
  estado: EstadoDoPix;
  agora: Date;
  aoMudar: () => void;
}) {
  const api = useApiDoPainel();
  const [pagamentos, setPagamentos] = useState<PagamentoPix[] | null>(null);
  // A lista acompanha o resumo: "Já paguei" e "Ainda não paguei" mudam os dois.
  const versao = `${resumo.pix.aguardando?.id ?? ""}|${resumo.periodoTerminaEm ?? ""}`;
  useEffect(() => {
    let vivo = true;
    api.barbeiro
      .pagamentosDoPix()
      .then((lista) => {
        if (vivo) setPagamentos(lista);
      })
      .catch(() => {
        if (vivo) setPagamentos([]);
      });
    return () => {
      vivo = false;
    };
  }, [api, versao]);

  const plano = resumo.plano === "gratis" ? "essencial" : resumo.plano;
  const limite = limiteDeProfissionais(plano);
  const equipe = Math.max(1, resumo.profissionais);
  const pedido: PedidoDeAssinatura = {
    plano,
    ciclo: resumo.ciclo,
    profissionais: limite === null ? equipe : Math.min(equipe, limite),
  };

  return (
    <div className={estilos.noPix}>
      {/* Um Pix em conferência por vez: com um aguardando, a diferença espera. */}
      {estado !== "aguardando" ? <DiferencaPendente plano={PLANOS[plano].nome} /> : null}
      {estado === "aguardando" ? (
        <Aguardando pagamento={resumo.pix.aguardando!} agora={agora} />
      ) : estado === "pago" ? (
        <Pago resumo={resumo} pedido={pedido} pagamentos={pagamentos} aoMudar={aoMudar} />
      ) : (
        <ProximoPix resumo={resumo} estado={estado} pedido={pedido} agora={agora} aoMudar={aoMudar} />
      )}
      <ListaDePagamentos pagamentos={pagamentos} />
    </div>
  );
}

function TopoDoPlano({ id, nome, selo }: { id: string; nome: string; selo: ReactNode }) {
  return (
    <div className={estilos.topoDoPlano}>
      <div>
        <p className={estilos.subtitulo}>Seu plano</p>
        <h2 id={id} className={`${estilos.nomeDoPlano} ${estilos.nomeNoPix}`}>
          {nome}
        </h2>
      </div>
      <span className={estilos.seloDoPix}>{selo}</span>
    </div>
  );
}

function Aguardando({ pagamento, agora }: { pagamento: PagamentoPix; agora: Date }) {
  const id = useId();
  const api = useApiDoPainel();
  const { recarregar } = useAssinatura();
  const [verQr, setVerQr] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function desfazer() {
    setDesfazendo(true);
    setErro(null);
    try {
      await api.barbeiro.desfazerOPix(pagamento.id);
      recarregar();
    } catch (causa) {
      setDesfazendo(false);
      setErro(causa instanceof ErroDaApi ? causa.message : "Não deu para desfazer. Tente de novo.");
    }
  }

  return (
    <section className={estilos.cartao} aria-labelledby={id}>
      <TopoDoPlano
        id={id}
        nome={nomeComCiclo(pagamento.plano, pagamento.ciclo)}
        selo={
          <Chip tamanho="pequeno" tom="atencao">
            Aguardando conferência
          </Chip>
        }
      />
      <p className={estilos.fraseDoPix}>
        Já vale pra {profissionais(pagamento.profissionais)}. O suporte do BarChop está conferindo o seu Pix no extrato.
      </p>
      <dl className={estilos.dadosDoPix}>
        <dt>Pix</dt>
        <dd>
          {formatarReais(pagamento.valorCentavos)} · {diaEHora(pagamento.criadoEm)}
        </dd>
        <dt>Vale</dt>
        <dd>
          {pontasDoPeriodo(pagamento.periodoComecaEm, pagamento.periodoTerminaEm).join(" a ")} ·{" "}
          {profissionais(pagamento.profissionais)}
        </dd>
      </dl>
      <p className={estilos.apoio}>
        Você não precisa fazer nada. Se o suporte não achar o Pix, o plano volta ao que era antes e a resposta dele
        aparece aqui.
      </p>
      {verQr ? (
        pagamento.copiaECola ? (
          <PixParaPagar
            valorCentavos={pagamento.valorCentavos}
            descricao={descricaoDoPix(pagamento, pagamento, agora)}
            copiaECola={pagamento.copiaECola}
          />
        ) : (
          <Aviso tom="atencao">O QR não está disponível agora. Tente de novo em alguns minutos.</Aviso>
        )
      ) : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      <div className={estilos.botoesDoPix}>
        <Botao variante="contorno" onClick={() => setVerQr((antes) => !antes)} aria-expanded={verQr}>
          {verQr ? "Esconder o QR e o código" : "Ver o QR e o código de novo"}
        </Botao>
        <Botao variante="fantasma" onClick={desfazer} carregando={desfazendo}>
          Ainda não paguei
        </Botao>
      </div>
    </section>
  );
}

function Pago({
  resumo,
  pedido,
  pagamentos,
  aoMudar,
}: {
  resumo: ResumoDaAssinatura;
  pedido: PedidoDeAssinatura;
  pagamentos: PagamentoPix[] | null;
  aoMudar: () => void;
}) {
  const id = useId();
  const fim = resumo.periodoTerminaEm!;
  // O Pix deste período, se o Suporte já conferiu.
  const deste = pagamentos?.find((p) => p.situacao === "confirmado" && p.periodoTerminaEm === fim) ?? null;
  const quantos = deste?.profissionais ?? pedido.profissionais;
  const aviso = new Date(Date.parse(fim) - DIAS_DO_AVISO_DO_PIX * UM_DIA).toISOString();

  return (
    <section className={estilos.cartao} aria-labelledby={id}>
      <TopoDoPlano
        id={id}
        nome={nomeComCiclo(pedido.plano, pedido.ciclo)}
        selo={
          <Chip tamanho="pequeno" tom="ok">
            Pago
          </Chip>
        }
      />
      <p className={estilos.fraseDoPix}>
        {deste?.decididoEm
          ? `Pix conferido pelo suporte em ${diaEMes(deste.decididoEm)}. Tudo certo até ${diaEMes(fim)}.`
          : `Tudo certo até ${diaEMes(fim)}.`}
      </p>
      <dl className={estilos.dadosDoPix}>
        <dt>Vale até</dt>
        <dd>
          {diaEMes(fim)} · {profissionais(quantos)}
        </dd>
        <dt>Próximo Pix</dt>
        <dd>
          {/* O mesmo pedido do QR da renovação: a equipe de hoje. */}
          {formatarReais(precoDoPlano(pedido.plano, pedido.ciclo, pedido.profissionais))} até {diaEMes(fim)}
        </dd>
      </dl>
      <p className={estilos.apoio}>
        Avisamos no sino e por e-mail no dia {diaEMes(aviso)}, com o QR do próximo {periodoDoCiclo(pedido.ciclo)}.
      </p>
      <Botao variante="contorno" onClick={aoMudar}>
        Mudar plano ou profissionais
      </Botao>
    </section>
  );
}

// Os 5 dias antes do fim e depois de vencer: o QR do próximo período,
// no mesmo plano; mudar abre a escolha.
function ProximoPix({
  resumo,
  estado,
  pedido,
  agora,
  aoMudar,
}: {
  resumo: ResumoDaAssinatura;
  estado: "renovar" | "vencido";
  pedido: PedidoDeAssinatura;
  agora: Date;
  aoMudar: () => void;
}) {
  const idDoPlano = useId();
  const idDoProximo = useId();
  const cotacao = useCotacaoDoPix(pedido);
  const vencido = estado === "vencido";
  const fim = diaEMes(resumo.periodoTerminaEm!);
  const nome = PLANOS[pedido.plano].nome;

  return (
    <>
      <section className={estilos.pedido} aria-labelledby={idDoPlano}>
        <TopoDoPlano
          id={idDoPlano}
          nome={vencido ? "Grátis" : nomeComCiclo(pedido.plano, pedido.ciclo)}
          selo={
            <Chip tamanho="pequeno" tom={vencido ? "erro" : "atencao"}>
              {vencido ? `Venceu em ${fim}` : `Vence em ${fim}`}
            </Chip>
          }
        />
      </section>
      <section className={estilos.cartao} aria-labelledby={idDoProximo}>
        <h2 id={idDoProximo} className={estilos.tituloDaEtapa}>
          {vencido ? `Voltar pro ${nome}` : `Pagar o próximo ${periodoDoCiclo(pedido.ciclo)}`}
        </h2>
        <PixDoPedido pedido={pedido} cotacao={cotacao} agora={agora} />
        <Botao variante="fantasma" onClick={aoMudar}>
          Mudar plano, ciclo ou profissionais
        </Botao>
      </section>
      {vencido ? (
        <p className={estilos.nadaApagado}>
          <strong>Nada foi apagado.</strong> A agenda, os clientes e o histórico continuam guardados. Pagar devolve a
          equipe toda ao link no mesmo estado.
        </p>
      ) : null}
    </>
  );
}

const ROTULO_DO_PIX: Record<Exclude<SituacaoDoPix, "desfeito">, { texto: string; tom: "ok" | "atencao" | "erro" }> = {
  aguardando: { texto: "Em conferência", tom: "atencao" },
  confirmado: { texto: "Pago", tom: "ok" },
  recusado: { texto: "Não encontrado", tom: "erro" },
};

function ListaDePagamentos({ pagamentos }: { pagamentos: PagamentoPix[] | null }) {
  const id = useId();
  const lista = (pagamentos ?? []).filter((p) => p.situacao !== "desfeito");
  if (lista.length === 0) return null;
  return (
    <section className={estilos.faturas} aria-labelledby={id}>
      <h2 id={id} className={estilos.legendaDaTabela}>
        Pagamentos
      </h2>
      <ul className={estilos.cobrancas} aria-labelledby={id}>
        {lista.map((p) => {
          const rotulo = ROTULO_DO_PIX[p.situacao as Exclude<SituacaoDoPix, "desfeito">];
          return (
            <li key={p.id} className={estilos.linhaDaCobranca}>
              <span className={estilos.quando}>
                <strong>
                  {diaEMes(p.criadoEm)} · Pix · {p.tipo === "diferenca" ? "Diferença" : "Período"}
                </strong>
                <span className={estilos.apoio}>
                  {p.tipo === "diferenca"
                    ? profissionais(p.liberados)
                    : `${nomeComCiclo(p.plano, p.ciclo)} · ${profissionais(p.profissionais)}`}{" "}
                  · {pontasDoPeriodo(p.periodoComecaEm, p.periodoTerminaEm).join(" a ")}
                </span>
              </span>
              <span className={estilos.valorDaCobranca}>{formatarReais(p.valorCentavos)}</span>
              <span>
                <Chip tamanho="pequeno" tom={rotulo.tom}>
                  {rotulo.texto}
                </Chip>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// O Pix da diferença (plano profissional-novo-pago): quem passou das
// vagas pagas no Pix aguarda; um QR só paga todos, de hoje até o fim do
// período pago. O mesmo na Equipe (/painel/equipe/pix) e no topo de
// Faturas. Sem ninguém aguardando, ou sem cotação (Pix em conferência,
// Pix desligado), não há o que pagar.
export function useDiferenca() {
  const api = useApiDoPainel();
  const equipe = useRequisicao(() => api.barbeiro.equipe(), []);
  const aguardam = equipe.dados ? equipe.dados.filter((m) => m.aguardaPagamento) : null;
  const quantos = aguardam?.length ?? 0;
  const cotacao = useRequisicao(
    () => (quantos > 0 ? api.barbeiro.cotacaoDaDiferenca() : Promise.resolve(null)),
    [quantos]
  );
  return { equipe, aguardam, cotacao };
}

// O QR, os passos e o "Já paguei" da diferença. `aoPagar` decide pra
// onde ir depois: a Equipe volta pra lista; Faturas relê a assinatura.
export function PagarADiferenca({
  aguardam,
  cotacao,
  plano,
  comPassos = false,
  aoPagar,
}: {
  aguardam: MembroDaEquipe[];
  cotacao: CotacaoDoPix;
  plano?: string;
  comPassos?: boolean;
  aoPagar: () => void;
}) {
  const api = useApiDoPainel();
  const [pagando, setPagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nomes = emLista(aguardam.map((m) => m.nome));
  const um = aguardam.length === 1;
  const periodo = pontasDoPeriodo(cotacao.periodoComecaEm, cotacao.periodoTerminaEm).join(" a ");

  async function pagar() {
    setPagando(true);
    setErro(null);
    try {
      await api.barbeiro.jaPagueiADiferenca();
      aoPagar();
    } catch (causa) {
      setPagando(false);
      setErro(
        causa instanceof ErroDaApi
          ? `Não deu para registrar o pagamento: ${causa.message}.`
          : "Não deu para registrar o pagamento. Tente de novo."
      );
    }
  }

  return (
    <PixParaPagar
      valorCentavos={cotacao.valorCentavos}
      descricao={`${profissionais(aguardam.length)} a mais${plano ? ` no ${plano}` : ""}, de ${periodo}`}
      copiaECola={cotacao.copiaECola}
      recebedor={cotacao.recebedor}
    >
      {comPassos ? <PassosDoPix /> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao onClick={pagar} carregando={pagando}>
        Já paguei
      </Botao>
      <p className={estilos.apoio}>
        {um ? `${nomes} entra na hora e recebe o convite por e-mail.` : `${nomes} entram na hora e recebem o convite por e-mail.`}{" "}
        O suporte do BarChop confere o Pix no extrato; se não achar, {um ? "volta" : "voltam"} a aguardar e nada é apagado.
      </p>
    </PixParaPagar>
  );
}

// No topo de Faturas (canvas Faturas-diferenca): o que falta pagar.
function DiferencaPendente({ plano }: { plano: string }) {
  const id = useId();
  const { recarregar } = useAssinatura();
  const { aguardam, cotacao } = useDiferenca();
  if (!aguardam || aguardam.length === 0 || !cotacao.dados) return null;
  const nomes = emLista(aguardam.map((m) => m.nome));
  return (
    <section className={estilos.cartao} aria-labelledby={id}>
      <div>
        <p className={estilos.subtitulo}>Falta pagar</p>
        <h2 id={id} className={`${estilos.nomeDoPlano} ${estilos.nomeNoPix}`}>
          Pix da diferença
        </h2>
      </div>
      <p className={estilos.fraseDoPix}>
        {nomes} {aguardam.length === 1 ? "entra" : "entram"} na equipe depois deste Pix.
      </p>
      <PagarADiferenca aguardam={aguardam} cotacao={cotacao.dados} plano={plano} aoPagar={recarregar} />
    </section>
  );
}
