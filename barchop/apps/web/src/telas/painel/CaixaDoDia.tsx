"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { CaixaDoDia as Caixa, PendenciaDoCaixa } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataComSemana, hojeIso, somarDias } from "../../formato/datas";
import {
  ROTULO_DA_FORMA,
  detalheDaMensalidade,
  fraseDoRepasse,
  fraseDoSaldo,
  horaNaBarbearia,
  naForma,
  reais,
  servicosDoPlano,
} from "../../painel/caixa";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { useAgora } from "../../painel/useAgora";
import { useTelaDeCelular } from "../../painel/useTelaDeCelular";
import estilos from "./CaixaDoDia.module.css";
import { Carregando } from "../../componentes/Carregando";
import { depoisDaSaida } from "../../movimento/depoisDaSaida";

// O Caixa (Onda 2, marco 2, PR 7 do plano caixa-do-dia): o dia do
// caixa é o do agendamento, escolhido na URL (`?data=`), como na
// Agenda. A ação da tela é "Fechar o dia", só do dono; o resto é leitura
// — quanto entrou, quem repassa quanto a quem, e o que falta registrar.

function maiuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const SITUACAO_DA_PENDENCIA: Record<PendenciaDoCaixa["status"], string> = {
  pendente: "ainda pendente",
  confirmado: "ainda confirmado",
  concluido: "concluído sem pagamento",
};

function avisoDasPendencias(quantas: number): string {
  return quantas === 1
    ? "1 atendimento ainda sem pagamento fica de fora do acerto."
    : `${quantas} atendimentos ainda sem pagamento ficam de fora do acerto.`;
}

function horaDoFechamento(instante: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(instante));
}

// `agora` por parâmetro, como a Agenda: o "hoje" do teste não depende do
// relógio de quem roda.
export function CaixaDoDia({ agora: agoraFixo }: { agora?: Date }) {
  const agora = useAgora(agoraFixo);
  const query = useSearchParams();
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const dono = perfil.papel === "dono";
  // No celular, o "Fechar o dia" sai do cabeçalho e vem depois dos
  // valores: a ação vinha antes do que ela fecha (redesenho, PR 4).
  const celular = useTelaDeCelular();

  const hoje = hojeIso(agora);
  const data = query.get("data") ?? hoje;
  const caixa = useRequisicao(() => api.barbeiro.caixaDoDia(data), [data]);

  const [confirmandoFechar, setConfirmandoFechar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();

  const apoio = maiuscula(formatarDataComSemana(data));

  if (caixa.erro?.codigo === "recurso_do_plano") {
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina titulo="Caixa" />
        <div className={estilos.convite}>
          <p>
            O caixa do dia é dos planos Essencial e Completo: registre cada pagamento, veja quanto cada um recebeu e
            feche o dia com o acerto pronto.
          </p>
          {dono ? (
            <Link className={estilos.principal} href="/painel/faturas">
              Ver os planos
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  async function agir(acao: () => Promise<unknown>) {
    setAviso(undefined);
    setSalvando(true);
    try {
      await acao();
      setConfirmandoFechar(false);
      caixa.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  const atual: Caixa | null = caixa.dados;
  const fechado = atual?.fechamento ?? null;
  const pendencias = atual?.pendencias ?? [];

  const fechar = () => void agir(() => api.barbeiro.fecharODia(data));
  const acaoDoDono =
    !dono || !atual ? null : fechado ? (
      <button
        type="button"
        className={estilos.secundaria}
        disabled={salvando}
        onClick={() => void agir(() => api.barbeiro.reabrirODia(data))}
      >
        Reabrir o dia
      </button>
    ) : (
      <button
        type="button"
        className={estilos.principal}
        disabled={salvando}
        aria-busy={salvando || undefined}
        // Com pendência, pede um segundo clique: o dia fechado não muda
        // mais sem reabrir (decisão 8 do plano).
        onClick={() => (pendencias.length > 0 ? setConfirmandoFechar(true) : fechar())}
      >
        Fechar o dia
      </button>
    );

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina titulo="Caixa" apoio={apoio} acao={celular ? undefined : acaoDoDono} />

      {confirmandoFechar ? (
        <JanelaDeFechamento
          pendencias={pendencias}
          salvando={salvando}
          aoFechar={fechar}
          aoDesistir={() => setConfirmandoFechar(false)}
        />
      ) : null}

      <nav className={estilos.dias} aria-label="Dias do caixa">
        <Link className={estilos.dia} href={`/painel/caixa?data=${somarDias(data, -1)}`}>
          <span aria-hidden="true">←</span>Dia anterior
        </Link>
        <Link className={estilos.dia} href="/painel/caixa" aria-current={data === hoje ? "date" : undefined}>
          Hoje
        </Link>
        <Link className={estilos.dia} href={`/painel/caixa?data=${somarDias(data, 1)}`}>
          Próximo dia<span aria-hidden="true">→</span>
        </Link>
      </nav>

      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {caixa.erro ? <Aviso>{caixa.erro.mensagem || "Não foi possível carregar o caixa."}</Aviso> : null}
      {!atual ? (
        caixa.erro ? null : <Carregando />
      ) : (
        <>
          {fechado ? (
            <p className={estilos.fechado} role="status">
              Dia fechado por {fechado.fechadoPor.nome} às {horaDoFechamento(fechado.fechadoEm)}. Os pagamentos deste
              dia só mudam se o dono reabrir.
            </p>
          ) : null}

          {/* Em cima, lado a lado: o acerto (a pergunta do fim do dia) e
              quanto entrou. Embaixo, as duas listas. */}
          <div className={estilos.topo}>
            <section className={estilos.grupo} aria-labelledby="caixa-acerto">
              <h2 id="caixa-acerto" className={estilos.rotulo}>
                Acerto do dia
              </h2>
              {atual.acerto.pessoas.length === 0 ? (
                <p className={estilos.vazio}>Ninguém recebeu nada ainda.</p>
              ) : (
                <div className={estilos.pessoas}>
                  {atual.acerto.pessoas.map((linha) => {
                    const nome = linha.pessoa?.nome ?? "A casa";
                    return (
                      <div key={linha.pessoa?.id ?? "casa"} className={estilos.pessoa} role="group" aria-label={nome}>
                        <span className={estilos.nome}>{nome}</span>
                        {/* Um número por pessoa, grande, com o selo do que ele
                            é. O texto é a mesma frase de antes ("Tem a receber
                            R$ 60,00"), só dividida em selo e valor. */}
                        <span className={estilos.saldo} data-sinal={Math.sign(linha.saldoCentavos)}>
                          <SaldoEmDestaque saldoCentavos={linha.saldoCentavos} />
                        </span>
                        <span className={estilos.detalhe}>
                          Recebeu {reais(linha.recebeuCentavos)} · cabe {reais(linha.cabeCentavos)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {atual.acerto.repasses.length > 0 ? (
                <ul className={estilos.repasses}>
                  {atual.acerto.repasses.map((repasse) => (
                    <li key={`${repasse.de?.id ?? "casa"}-${repasse.para?.id ?? "casa"}`} className={estilos.repasse}>
                      {/* À vista, uma seta de quem pra quem; o leitor de tela
                          ouve a frase inteira. */}
                      <span aria-hidden="true">
                        {repasse.de?.nome ?? "A casa"} <span className={estilos.seta}>→</span> {repasse.para?.nome ?? "a casa"}
                      </span>
                      <strong aria-hidden="true">{reais(repasse.valorCentavos)}</strong>
                      <span className={estilos.somenteLeitor}>{fraseDoRepasse(repasse)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className={estilos.grupo} aria-labelledby="caixa-entrou">
              <h2 id="caixa-entrou" className={estilos.rotulo}>
                Entrou no dia
              </h2>
              <p className={estilos.total}>{reais(atual.totais.totalCentavos)}</p>
              <dl className={estilos.formas}>
                {/* A linha Online só no dia em que entrou mensalidade paga
                    pelo provedor: a maioria das barbearias não vende online. */}
                {atual.totais.porForma.filter((total) => total.forma !== "online" || total.quantidade > 0).map((total) => (
                  <div key={total.forma} className={estilos.forma} data-vazia={total.quantidade === 0 || undefined}>
                    <dt>{ROTULO_DA_FORMA[total.forma]}</dt>
                    <dd>{reais(total.valorCentavos)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {celular && acaoDoDono ? <div className={estilos.fechamento}>{acaoDoDono}</div> : null}

          <div className={estilos.listas}>
            {/* Pagamentos e mensalidades numa coluna só: os dois são o
                dinheiro do dia. */}
            <div className={estilos.grupo}>
              <section className={estilos.pilha} aria-labelledby="caixa-pagamentos">
                <h2 id="caixa-pagamentos" className={estilos.rotulo}>
                  Pagamentos
                </h2>
                {atual.pagamentos.length === 0 ? (
                  <p className={estilos.vazio}>Nenhum pagamento neste dia.</p>
                ) : (
                  <ul className={estilos.lista}>
                    {atual.pagamentos.map((pagamento) => (
                      <li key={pagamento.id}>
                        <Link className={estilos.item} href={`/painel/agendamentos/${pagamento.agendamentoId}`}>
                          <span className={estilos.hora}>{pagamento.horaInicio}</span>
                          <span className={estilos.quem}>
                            {pagamento.cliente.nome}
                            <span className={estilos.detalhe}>
                              {" · com "}
                              {pagamento.atendente.nome}
                              {pagamento.assinatura ? ` · ${servicosDoPlano(pagamento)} pelo plano` : null}
                            </span>
                          </span>
                          <span className={estilos.valor}>
                            {reais(pagamento.totalCentavos)} {naForma(pagamento.forma)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {atual.pagamentos.some((pagamento) => pagamento.assinatura) ? (
                  <p className={estilos.nota}>
                    Atendimento pelo plano não entra como dinheiro do dia: a mensalidade já entrou quando foi paga.
                  </p>
                ) : null}
              </section>

              {atual.mensalidades.length > 0 ? (
                <section className={estilos.pilha} aria-labelledby="caixa-mensalidades">
                  <h2 id="caixa-mensalidades" className={estilos.rotulo}>
                    Mensalidades
                  </h2>
                  <ul className={estilos.lista}>
                    {atual.mensalidades.map((mensalidade) => (
                      <li key={mensalidade.id}>
                        <Link className={estilos.item} href={`/painel/clientes/${mensalidade.cliente.id}`}>
                          <span className={estilos.hora}>{horaNaBarbearia(mensalidade.registradoEm)}</span>
                          <span className={estilos.quem}>
                            {`${mensalidade.cliente.nome} · ${mensalidade.plano.nome}`}
                            <span className={estilos.detalheDaMensalidade}>{detalheDaMensalidade(mensalidade)}</span>
                          </span>
                          <span className={estilos.valor}>
                            {reais(mensalidade.valorCentavos)} {naForma(mensalidade.forma)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <section className={estilos.grupo} aria-labelledby="caixa-pendencias">
              <h2 id="caixa-pendencias" className={estilos.rotulo}>
                Pendências
              </h2>
              {pendencias.length === 0 ? (
                <p className={estilos.vazio}>Nada pendente: todo atendimento do dia está registrado.</p>
              ) : (
                <ul className={estilos.lista}>
                  {pendencias.map((pendencia) => (
                    <li key={pendencia.agendamentoId}>
                      <Link className={estilos.item} href={`/painel/agendamentos/${pendencia.agendamentoId}`}>
                        <span className={estilos.hora}>{pendencia.horaInicio}</span>
                        <span className={estilos.quem}>
                          {pendencia.cliente.nome}
                          <span className={estilos.detalhe}> · com {pendencia.barbeiro.nome}</span>
                        </span>
                        <span className={estilos.situacao}>{SITUACAO_DA_PENDENCIA[pendencia.status]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

// "Tem a receber" num selo e o valor grande ao lado — a mesma frase, em
// duas partes à vista e inteira pro leitor de tela. Acertado não tem
// valor.
function SaldoEmDestaque({ saldoCentavos }: { saldoCentavos: number }) {
  if (saldoCentavos === 0) return <span className={estilos.seloDoSaldo}>{fraseDoSaldo(0)}</span>;
  const frase = fraseDoSaldo(saldoCentavos);
  const valor = reais(Math.abs(saldoCentavos));
  return (
    <>
      <span className={estilos.seloDoSaldo} aria-hidden="true">
        {frase.replace(` ${valor}`, "")}
      </span>
      <span className={estilos.valorDoSaldo} aria-hidden="true">
        {valor}
      </span>
      <span className={estilos.somenteLeitor}>{frase}</span>
    </>
  );
}

// A confirmação de fechar com pendência (17/10): numa janela, com a
// lista do que fica de fora do acerto, em vez de uma frase longa ao lado
// dos botões.
function JanelaDeFechamento({
  pendencias,
  salvando,
  aoFechar,
  aoDesistir,
}: {
  pendencias: PendenciaDoCaixa[];
  salvando: boolean;
  aoFechar: () => void;
  aoDesistir: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  return (
    <dialog ref={janela} className={estilos.janela} aria-labelledby={titulo} onClose={(evento) => depoisDaSaida(evento.currentTarget, aoDesistir)}>
      <h2 id={titulo} className={estilos.tituloDaJanela}>
        Fechar o dia?
      </h2>
      <p>{avisoDasPendencias(pendencias.length)}</p>
      <ul className={estilos.listaDaJanela}>
        {pendencias.map((pendencia) => (
          <li key={pendencia.agendamentoId}>
            <span className={estilos.hora}>{pendencia.horaInicio}</span> {pendencia.cliente.nome} ·{" "}
            {SITUACAO_DA_PENDENCIA[pendencia.status]}
          </li>
        ))}
      </ul>
      <div className={estilos.botoesDaJanela}>
        <button type="button" className={estilos.discreta} onClick={() => janela.current?.close()}>
          Não
        </button>
        <button
          type="button"
          className={estilos.principal}
          disabled={salvando}
          aria-busy={salvando || undefined}
          onClick={aoFechar}
        >
          Sim, fechar
        </button>
      </div>
    </dialog>
  );
}
