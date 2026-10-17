"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { CaixaDoDia as Caixa, PendenciaDoCaixa } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataComSemana, hojeIso, somarDias } from "../../formato/datas";
import { ROTULO_DA_FORMA, fraseDoRepasse, fraseDoSaldo, naForma, reais } from "../../painel/caixa";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { useAgora } from "../../painel/useAgora";
import estilos from "./CaixaDoDia.module.css";
import { Carregando } from "../../componentes/Carregando";

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
    ) : confirmandoFechar ? (
      <div className={estilos.confirmar} role="group" aria-label="Confirmar fechamento">
        <span>{avisoDasPendencias(pendencias.length)} Fechar mesmo assim?</span>
        <button
          type="button"
          className={estilos.principal}
          disabled={salvando}
          aria-busy={salvando || undefined}
          onClick={fechar}
        >
          Sim, fechar
        </button>
        <button type="button" className={estilos.discreta} onClick={() => setConfirmandoFechar(false)}>
          Não
        </button>
      </div>
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
      <CabecalhoDaPagina titulo="Caixa" apoio={apoio} acao={acaoDoDono} />

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
                        <span className={estilos.saldo} data-sinal={Math.sign(linha.saldoCentavos)}>
                          {fraseDoSaldo(linha.saldoCentavos)}
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
                    <li key={`${repasse.de.id}-${repasse.para?.id ?? "casa"}`}>{fraseDoRepasse(repasse)}</li>
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
                {atual.totais.porForma.map((total) => (
                  <div key={total.forma} className={estilos.forma} data-vazia={total.quantidade === 0 || undefined}>
                    <dt>{ROTULO_DA_FORMA[total.forma]}</dt>
                    <dd>{reais(total.valorCentavos)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <div className={estilos.listas}>
            <section className={estilos.grupo} aria-labelledby="caixa-pagamentos">
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
                          <span className={estilos.detalhe}> · com {pagamento.atendente.nome}</span>
                        </span>
                        <span className={estilos.valor}>
                          {reais(pagamento.totalCentavos)} {naForma(pagamento.forma)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

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
