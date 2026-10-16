"use client";

import { useId, useState } from "react";
import { FORMAS_DE_PAGAMENTO } from "@barchop/formato";
import type { ErroDaApi } from "@barchop/api-client";
import type { FormaDoPagamento, MembroDoCaixa, PagamentoDoAgendamento } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import {
  ROTULO_DA_FORMA,
  centavosNoCampo,
  fraseDaDivisao,
  naForma,
  paraCentavos,
  reais,
} from "../../painel/caixa";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./PagamentoDoAtendimento.module.css";

// O pagamento de um atendimento, na faixa do próximo passo do detalhe
// do agendamento (Onda 2, marco 2, PR 6 do plano caixa-do-dia). Dois
// estados: o formulário (registrar ou editar) e o resumo do que ficou
// gravado, com a frase de como o dinheiro se dividiu.

const OPCOES_DE_FORMA = FORMAS_DE_PAGAMENTO.map((valor) => ({ valor, rotulo: ROTULO_DA_FORMA[valor] }));

export function FormularioDoPagamento({
  agendamentoId,
  somaDosServicos,
  atendenteId,
  membros,
  atual,
  aoRegistrar,
  aoCancelar,
}: {
  agendamentoId: string;
  // A soma dos `precoNoMomento`: o valor combinado com o cliente.
  somaDosServicos: number;
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
  const [valor, setValor] = useState(centavosNoCampo(atual?.servicosCentavos ?? somaDosServicos));
  const [desconto, setDesconto] = useState(centavosNoCampo(atual?.descontoCentavos ?? 0));
  const [gorjeta, setGorjeta] = useState(centavosNoCampo(atual?.gorjetaCentavos ?? 0));
  // Sem forma escolhida de início: a forma errada estraga o caixa do dia.
  const [forma, setForma] = useState<FormaDoPagamento | "">(atual?.forma ?? "");
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

  async function registrar() {
    if (!conta || forma === "") return;
    setSalvando(true);
    setAviso(undefined);
    try {
      await api.barbeiro.registrarPagamento(agendamentoId, { forma, ...conta, recebidoPorId: recebidoPor });
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
      {/* Desktop: os valores numa coluna, forma e quem recebeu na outra;
          no celular, um embaixo do outro. */}
      <div className={estilos.campos}>
        <div className={estilos.valores}>
          <Campo
            rotulo="Valor dos serviços"
            apoio="Soma dos serviços"
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
        <div className={estilos.escolhas}>
          <SeletorEmPilulas<FormaDoPagamento | "">
            nome={`${id}-forma`}
            legenda="Forma de pagamento"
            opcoes={OPCOES_DE_FORMA}
            valor={forma}
            aoTrocar={setForma}
            efeito={forma === "" ? "Escolha como o cliente pagou." : undefined}
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
      </div>
      <div className={estilos.rodape}>
        <button type="button" className={estilos.discreta} onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button
          type="submit"
          className={estilos.principal}
          disabled={!conta || forma === "" || salvando}
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
        <p className={estilos.pago}>
          Pago: {reais(pagamento.totalCentavos)} {naForma(pagamento.forma)}, recebido por {pagamento.recebidoPor.nome}.
        </p>
        <p className={estilos.divisao}>{fraseDaDivisao(pagamento.partes)}</p>
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
