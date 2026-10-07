"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { Campo } from "../../../componentes/Campo";
import { Chip } from "../../../componentes/Chip";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import { ExcecoesDeHorario } from "./ExcecoesDeHorario";
import { PausasDaEquipe } from "./PausasDaEquipe";
import {
  aplicarRotina,
  difereDaRotina,
  fraseDaRotina,
  ORDEM_DA_SEMANA,
  rotinaDaSemana,
  SIGLA_DO_DIA,
  type Rotina,
} from "./rotina";
import estilos from "./Configuracoes.module.css";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Os três jeitos mais comuns de uma barbearia abrir, a um clique.
const ATALHOS: { rotulo: string; rotina: Rotina }[] = [
  { rotulo: "Seg a sex · 9–18", rotina: { dias: [1, 2, 3, 4, 5], abre: "09:00", fecha: "18:00" } },
  { rotulo: "Seg a sáb · 9–19", rotina: { dias: [1, 2, 3, 4, 5, 6], abre: "09:00", fecha: "19:00" } },
  { rotulo: "Todos os dias · 9–18", rotina: { dias: [0, 1, 2, 3, 4, 5, 6], abre: "09:00", fecha: "18:00" } },
];

// Horários de funcionamento (painel v2, marco 2): a rotina da semana —
// dias que abre e um horário, aplicados de uma vez — e a semana dia a
// dia, onde um dia pode ficar diferente da rotina.
export function HorariosDaBarbearia() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") return <SoODono area="horarios" />;
  return <Horarios />;
}

function Horarios() {
  const api = useApiDoPainel();
  const horariosSalvos = useRequisicao(() => api.barbeiro.horarios(), []);
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const { decididas, marcar } = useAreasDecididas(barbearia.dados?.areasDecididas);
  const [semana, setSemana] = useState<HorarioSerializado[]>([]);
  const [rotina, setRotina] = useState<Rotina>({ dias: [], abre: "09:00", fecha: "18:00" });
  const [erroDaRotina, setErroDaRotina] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizar depois do commit (via efeito) deixaria uma janela em que
  // o formulário já mostra os dias mas `semana` ainda é `[]`. A
  // comparação de referência também faz `horariosSalvos.recarregar()`
  // (depois de salvar) sincronizar de novo, uma vez só. A rotina nasce
  // da semana salva.
  const [semanaSincronizada, setSemanaSincronizada] = useState<typeof horariosSalvos.dados>(null);
  if (horariosSalvos.dados && horariosSalvos.dados !== semanaSincronizada) {
    setSemanaSincronizada(horariosSalvos.dados);
    setSemana(horariosSalvos.dados);
    setRotina(rotinaDaSemana(horariosSalvos.dados));
  }

  function trocarRotina(mudanca: Partial<Rotina>) {
    setErroDaRotina(undefined);
    setRotina((atual) => ({ ...atual, ...mudanca }));
  }

  function alternarDia(dia: number) {
    trocarRotina({
      dias: rotina.dias.includes(dia) ? rotina.dias.filter((d) => d !== dia) : [...rotina.dias, dia].sort((a, b) => a - b),
    });
  }

  function aplicar() {
    // "HH:mm" com zero à esquerda compara na mesma ordem que o relógio.
    if (rotina.dias.length > 0 && (!rotina.abre || !rotina.fecha || rotina.abre >= rotina.fecha)) {
      setErroDaRotina("A rotina precisa fechar depois de abrir");
      return;
    }
    setSemana((atual) => aplicarRotina(atual, rotina));
  }

  async function salvar() {
    setAviso(undefined);
    setSalvando(true);
    try {
      // A semana inteira, sempre: dia ausente do corpo vira fechado na
      // API, de propósito — "sem linha" e "fechado" são estados
      // diferentes pro cálculo de disponibilidade.
      await api.barbeiro.salvarHorarios(semana);
      marcar("horarios");
      horariosSalvos.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  function trocarDia(diaSemana: number, mudanca: Partial<HorarioSerializado>) {
    setSemana((atual) => atual.map((dia) => (dia.diaSemana === diaSemana ? { ...dia, ...mudanca } : dia)));
  }

  const erro = barbearia.erro ?? horariosSalvos.erro;
  if (erro) return <Aviso>{erro.mensagem || "Não foi possível carregar os horários agora."}</Aviso>;
  // Sem esta trava, "Salvar horários" clicado antes da resposta chegar
  // mandaria `semana` vazio — e sete dias ausentes do corpo fecham a
  // semana inteira na API.
  if (!barbearia.dados || !horariosSalvos.dados) return <p>Carregando…</p>;

  // A semana na ordem do dono: segunda primeiro.
  const semanaNaOrdem = ORDEM_DA_SEMANA.map((dia) => semana.find((h) => h.diaSemana === dia)).filter(
    (h): h is HorarioSerializado => !!h
  );

  return (
    <MolduraDaArea area="horarios" decididas={decididas} aviso={aviso}>
      <div className={estilos.colunaLarga}>
        <Secao
          titulo="A rotina da semana"
          descricao="Os dias em que abre e o horário de sempre. Aplicar preenche a semana aqui embaixo — os dias fora da rotina ficam fechados."
          acao={
            <Botao variante="contorno" onClick={aplicar}>
              Aplicar à semana
            </Botao>
          }
        >
          <div className={estilos.atalhos} role="group" aria-label="Atalhos de rotina">
            {ATALHOS.map((atalho) => (
              <button
                key={atalho.rotulo}
                type="button"
                className={estilos.atalho}
                onClick={() => trocarRotina(atalho.rotina)}
              >
                {atalho.rotulo}
              </button>
            ))}
          </div>

          <fieldset className={estilos.diasDaRotina}>
            <legend className={estilos.rotulo}>Dias em que abre</legend>
            {ORDEM_DA_SEMANA.map((dia) => (
              <label key={dia} className={estilos.diaDaRotina}>
                <input
                  type="checkbox"
                  className={estilos.marcaEscondida}
                  checked={rotina.dias.includes(dia)}
                  onChange={() => alternarDia(dia)}
                />
                <span>{SIGLA_DO_DIA[dia]}</span>
              </label>
            ))}
          </fieldset>

          <div className={estilos.horas}>
            <Campo
              rotulo="Abre"
              type="time"
              aria-label="Rotina: abre"
              valor={rotina.abre}
              onChange={(valor) => trocarRotina({ abre: valor })}
            />
            <Campo
              rotulo="Fecha"
              type="time"
              aria-label="Rotina: fecha"
              valor={rotina.fecha}
              onChange={(valor) => trocarRotina({ fecha: valor })}
              erro={erroDaRotina}
            />
          </div>

          <p className={estilos.resultado} aria-live="polite">
            {`Resultado: ${fraseDaRotina(rotina)}`}
          </p>
        </Secao>

        <Secao
          titulo="A semana"
          descricao="O que vale em cada dia. Um dia pode ter horário próprio — ele fica marcado como diferente da rotina."
          acao={
            <Botao onClick={salvar} carregando={salvando}>
              Salvar horários
            </Botao>
          }
        >
          {semanaNaOrdem.map((dia) => (
            <div key={dia.diaSemana} className={estilos.dia}>
              <span className={estilos.nomeDoDia}>
                {DIAS[dia.diaSemana]}
                {difereDaRotina(dia, rotina) ? (
                  <Chip tom="neutro" tamanho="pequeno">
                    Diferente da rotina
                  </Chip>
                ) : null}
              </span>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Fechado na ${DIAS[dia.diaSemana]}`}
                  checked={dia.fechado}
                  onChange={(evento) =>
                    // Fechar limpa as horas: a hora antiga junto de
                    // fechado guardaria um estado que a API não usa.
                    trocarDia(
                      dia.diaSemana,
                      evento.target.checked
                        ? { fechado: true, horaAbertura: null, horaFechamento: null }
                        : { fechado: false, horaAbertura: rotina.abre, horaFechamento: rotina.fecha }
                    )
                  }
                />
                fechado
              </label>
              {/* Os dois campos embrulhados: aberto e fechado têm o mesmo
                  número de filhos e as colunas seguem alinhadas. */}
              <div className={estilos.horas}>
                {dia.fechado ? null : (
                  <>
                    <Campo
                      // Rótulo curto no olho, nome inteiro pra quem ouve.
                      rotulo="Abre"
                      type="time"
                      aria-label={`Abre na ${DIAS[dia.diaSemana]}`}
                      valor={dia.horaAbertura ?? ""}
                      onChange={(valor) => trocarDia(dia.diaSemana, { horaAbertura: valor })}
                    />
                    <Campo
                      rotulo="Fecha"
                      type="time"
                      aria-label={`Fecha na ${DIAS[dia.diaSemana]}`}
                      valor={dia.horaFechamento ?? ""}
                      onChange={(valor) => trocarDia(dia.diaSemana, { horaFechamento: valor })}
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </Secao>

        <ExcecoesDeHorario aoDecidir={() => marcar("horarios")} />

        <PausasDaEquipe />
      </div>
    </MolduraDaArea>
  );
}
