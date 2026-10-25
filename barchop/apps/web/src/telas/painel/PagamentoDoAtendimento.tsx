"use client";

import { useId, useState } from "react";
import { FORMAS_DE_PAGAMENTO } from "@barchop/formato";
import type { ErroDaApi } from "@barchop/api-client";
import type { AssinaturaNoPagamento, FormaDoPagamento, MembroDoCaixa, PagamentoDoAgendamento } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import {
  ROTULO_DA_FORMA,
  centavosNoCampo,
  fraseDaDivisaoDoPagamento,
  naForma,
  paraCentavos,
  reais,
  servicosDoPlano,
} from "../../painel/caixa";
import { planosDoAtendimento, somaAvulsa, type LinhaDoAtendimento } from "../../painel/pelo-plano";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./PagamentoDoAtendimento.module.css";

// O pagamento de um atendimento, na faixa do próximo passo do detalhe
// do agendamento (Onda 2, marco 2, PR 6 do plano caixa-do-dia). Dois
// estados: o formulário (registrar ou editar) e o resumo do que ficou
// gravado, com a frase de como o dinheiro se dividiu. Com o cliente
// assinante (PR 7c do plano planos-de-assinatura), "Usar o plano" diz o
// que vai pelo plano e o que é cobrado à parte.

const OPCOES_DE_FORMA = FORMAS_DE_PAGAMENTO.map((valor) => ({ valor, rotulo: ROTULO_DA_FORMA[valor] }));

export function FormularioDoPagamento({
  agendamentoId,
  servicos,
  assinaturas = [],
  atendenteId,
  membros,
  atual,
  aoRegistrar,
  aoCancelar,
}: {
  agendamentoId: string;
  // As linhas do atendimento, com o `precoNoMomento`: a soma é o valor
  // combinado com o cliente.
  servicos: LinhaDoAtendimento[];
  // As assinaturas vivas do cliente (o GET do pagamento).
  assinaturas?: AssinaturaNoPagamento[];
  atendenteId: string;
  // Quem pode ter recebido: os membros ativos da equipe.
  membros: MembroDoCaixa[];
  // Editando, o que está gravado; registrando, null.
  atual: PagamentoDoAgendamento | null;
  aoRegistrar: () => void;
  aoCancelar: () => void;
}) {
  const api = useApiDoPainel();
  const id = useId();
  const { opcoes: planos, notas } = planosDoAtendimento(assinaturas, servicos, atual);
  // O plano que vale vem escolhido: esquecer de marcar cobraria o
  // assinante. Editando, vale o que foi gravado.
  const [planoId, setPlanoId] = useState(atual ? (atual.assinatura?.id ?? "") : (planos[0]?.id ?? ""));
  const plano = planos.find((opcao) => opcao.id === planoId) ?? null;
  const [valor, setValor] = useState(centavosNoCampo(atual?.servicosCentavos ?? somaAvulsa(servicos, plano)));
  const [desconto, setDesconto] = useState(centavosNoCampo(atual?.descontoCentavos ?? 0));
  const [gorjeta, setGorjeta] = useState(centavosNoCampo(atual?.gorjetaCentavos ?? 0));
  // Sem forma escolhida de início: a forma errada estraga o caixa do dia.
  // "Pelo plano" não é escolha: vem sozinha quando não há o que cobrar.
  const [forma, setForma] = useState<FormaDoPagamento | "">(atual && atual.forma !== "plano" ? atual.forma : "");
  // Quem recebeu começa em quem atendeu ("paguei na maquininha do
  // Gustavo" é a troca).
  const [recebidoPor, setRecebidoPor] = useState(
    atual?.recebidoPor.id ?? (membros.some((m) => m.id === atendenteId) ? atendenteId : (membros[0]?.id ?? atendenteId))
  );
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();

  const servicosCentavos = paraCentavos(valor);
  const descontoCentavos = paraCentavos(desconto);
  const gorjetaCentavos = paraCentavos(gorjeta);
  const erroDoDesconto =
    descontoCentavos === null
      ? "Use um valor como 5,00"
      : servicosCentavos !== null && descontoCentavos > servicosCentavos
        ? "O desconto passa do valor dos serviços."
        : undefined;
  const conta =
    servicosCentavos !== null && descontoCentavos !== null && gorjetaCentavos !== null && erroDoDesconto === undefined
      ? { servicosCentavos, descontoCentavos, gorjetaCentavos }
      : null;

  // A regra da API: com o plano e nada cobrado (nem gorjeta), a forma é
  // "plano" e não há quem recebeu; com dinheiro, a forma é a dele.
  const nadaCobrado = plano !== null && conta !== null && conta.servicosCentavos === 0 && conta.gorjetaCentavos === 0;

  function escolherPlano(escolhido: string) {
    setPlanoId(escolhido);
    setValor(centavosNoCampo(somaAvulsa(servicos, planos.find((opcao) => opcao.id === escolhido) ?? null)));
  }

  async function registrar() {
    if (!conta || (forma === "" && !nadaCobrado)) return;
    setSalvando(true);
    setAviso(undefined);
    try {
      await api.barbeiro.registrarPagamento(agendamentoId, {
        forma: nadaCobrado || forma === "" ? "plano" : forma,
        ...(plano ? { assinaturaId: plano.id } : {}),
        ...conta,
        ...(nadaCobrado ? {} : { recebidoPorId: recebidoPor }),
      });
      aoRegistrar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível registrar agora.");
      setSalvando(false);
    }
  }

  const total = conta ? conta.servicosCentavos - conta.descontoCentavos + conta.gorjetaCentavos : null;

  return (
    <form
      className={estilos.formulario}
      aria-label={atual ? "Editar pagamento" : "Registrar pagamento"}
      onSubmit={(evento) => {
        evento.preventDefault();
        void registrar();
      }}
    >
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {planos.length > 0 ? (
        <div className={estilos.plano}>
          <fieldset className={estilos.usarOPlano}>
            <legend className={estilos.legenda}>Usar o plano</legend>
            {planos.map((opcao) => (
              <label key={opcao.id} className={estilos.opcaoDoPlano}>
                <input
                  type="radio"
                  name={`${id}-plano`}
                  value={opcao.id}
                  checked={opcao.id === planoId}
                  onChange={() => escolherPlano(opcao.id)}
                />
                <span className={estilos.textoDaOpcao}>
                  <span className={estilos.nomeDaOpcao}>{opcao.nome}</span>
                  <span className={estilos.apoio}>{opcao.apoio}</span>
                </span>
              </label>
            ))}
            <label className={estilos.opcaoDoPlano}>
              <input
                type="radio"
                name={`${id}-plano`}
                value=""
                checked={planoId === ""}
                onChange={() => escolherPlano("")}
              />
              <span className={estilos.textoDaOpcao}>Não usar: cobrar tudo avulso</span>
            </label>
          </fieldset>
          {plano ? (
            <ul className={estilos.linhas} aria-label="Serviços do atendimento">
              {plano.linhas.map((linha, indice) => (
                <li key={`${linha.servicoId}-${indice}`} className={estilos.linha}>
                  <span className={estilos.textoDaOpcao}>
                    <span className={estilos.nomeDaOpcao}>{linha.nome}</span>
                    <span className={estilos.apoio}>
                      {linha.peloPlano ? (linha.uso ? `Pelo plano · ${linha.uso}` : "Pelo plano") : "Fora do plano · avulso"}
                    </span>
                  </span>
                  <span className={estilos.precoDaLinha}>{reais(linha.peloPlano ? 0 : linha.precoCentavos)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {notas ? <p className={estilos.nota}>{notas}</p> : null}
      {/* Desktop: os valores numa coluna, forma e quem recebeu na outra;
          no celular, um embaixo do outro. */}
      <div className={estilos.campos}>
        <div className={estilos.valores}>
          <Campo
            rotulo="Valor dos serviços"
            apoio={plano ? "O que ficou fora do plano" : "Soma dos serviços"}
            inputMode="decimal"
            valor={valor}
            onChange={setValor}
            erro={servicosCentavos === null ? "Use um valor como 40,00" : undefined}
          />
          <Campo
            rotulo="Desconto"
            apoio="Opcional"
            inputMode="decimal"
            valor={desconto}
            onChange={setDesconto}
            erro={erroDoDesconto}
          />
          <Campo
            rotulo="Gorjeta"
            apoio="Fica com quem atendeu"
            inputMode="decimal"
            valor={gorjeta}
            onChange={setGorjeta}
            erro={gorjetaCentavos === null ? "Use um valor como 5,00" : undefined}
          />
        </div>
        {nadaCobrado ? (
          <p className={estilos.nadaACobrar}>Nada a cobrar: o caixa registra o atendimento como pago pelo plano.</p>
        ) : (
          <div className={estilos.escolhas}>
            <SeletorEmPilulas<FormaDoPagamento | "">
              nome={`${id}-forma`}
              legenda="Forma de pagamento"
              opcoes={OPCOES_DE_FORMA}
              valor={forma}
              aoTrocar={setForma}
              efeito={
                forma !== ""
                  ? undefined
                  : plano
                    ? "Escolha como o cliente pagou o que ficou fora do plano."
                    : "Escolha como o cliente pagou."
              }
            />
            {membros.length > 1 ? (
              <SeletorEmPilulas
                nome={`${id}-recebido`}
                legenda="Quem recebeu"
                opcoes={membros.map((m) => ({ valor: m.id, rotulo: m.nome }))}
                valor={recebidoPor}
                aoTrocar={setRecebidoPor}
              />
            ) : null}
          </div>
        )}
      </div>
      <div className={estilos.rodape}>
        <button type="button" className={estilos.discreta} onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button
          type="submit"
          className={estilos.principal}
          disabled={!conta || (forma === "" && !nadaCobrado) || salvando}
          aria-busy={salvando || undefined}
        >
          {salvando
            ? "Salvando…"
            : `${atual ? "Salvar" : "Registrar"} ${total === null ? "R$ —" : reais(total)}`}
        </button>
      </div>
    </form>
  );
}

export function ResumoDoPagamento({
  pagamento,
  diaFechado,
  aoEditar,
  aoRemover,
}: {
  pagamento: PagamentoDoAgendamento;
  diaFechado: boolean;
  aoEditar: () => void;
  aoRemover: () => Promise<void>;
}) {
  const [confirmandoRemover, setConfirmandoRemover] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  return (
    <section className={estilos.resumo} aria-label="Pagamento">
      <div className={estilos.texto}>
        {pagamento.forma === "plano" && pagamento.assinatura ? (
          <p className={estilos.pago}>
            Pago pelo plano {pagamento.assinatura.plano.nome}: {servicosDoPlano(pagamento)}.
          </p>
        ) : (
          <>
            <p className={estilos.pago}>
              Pago: {reais(pagamento.totalCentavos)} {naForma(pagamento.forma)}, recebido por{" "}
              {pagamento.recebidoPor.nome}.
            </p>
            {pagamento.assinatura ? (
              <p className={estilos.divisao}>
                Pelo plano {pagamento.assinatura.plano.nome}: {servicosDoPlano(pagamento)}.
              </p>
            ) : null}
          </>
        )}
        <p className={estilos.divisao}>{fraseDaDivisaoDoPagamento(pagamento)}</p>
        {diaFechado ? (
          <p className={estilos.fechado}>
            O caixa deste dia está fechado: para mudar o pagamento, o dono reabre o dia no Caixa.
          </p>
        ) : null}
      </div>
      {diaFechado ? null : confirmandoRemover ? (
        <div className={estilos.acoes} role="group" aria-label="Confirmar remoção">
          <span>Remover o pagamento? O atendimento continua concluído.</span>
          <button
            type="button"
            className={estilos.perigo}
            disabled={removendo}
            aria-busy={removendo || undefined}
            onClick={async () => {
              setRemovendo(true);
              await aoRemover();
              setRemovendo(false);
              setConfirmandoRemover(false);
            }}
          >
            Sim, remover
          </button>
          <button type="button" className={estilos.discreta} onClick={() => setConfirmandoRemover(false)}>
            Não
          </button>
        </div>
      ) : (
        <div className={estilos.acoes}>
          <button type="button" className={estilos.secundaria} onClick={aoEditar}>
            Editar pagamento
          </button>
          <button type="button" className={estilos.discretaPerigo} onClick={() => setConfirmandoRemover(true)}>
            Remover pagamento
          </button>
        </div>
      )}
    </section>
  );
}
