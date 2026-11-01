"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { BarraDeMudancas } from "../../../componentes/BarraDeMudancas";
import { Campo } from "../../../componentes/Campo";
import { Interruptor } from "../../../componentes/Interruptor";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import { ExcecoesDeHorario } from "./ExcecoesDeHorario";
import { PausasDaEquipe } from "./PausasDaEquipe";
import { aplicarRotina, ORDEM_DA_SEMANA, rotinaDaSemana, type Rotina } from "./rotina";
import estilos from "./Configuracoes.module.css";
import { Carregando } from "../../../componentes/Carregando";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// "na segunda", "no sábado": o nome acessível dos campos de cada dia.
function noDia(diaSemana: number): string {
  const dia = DIAS[diaSemana]!;
  return diaSemana === 0 || diaSemana === 6 ? `no ${dia}` : `na ${dia}`;
}

function comMaiuscula(texto: string): string {
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
}

function horarioDoDia(dia: HorarioSerializado): string {
  return dia.fechado ? "fechado" : `${dia.horaAbertura ?? ""}–${dia.horaFechamento ?? ""}`;
}

// O que a barra diz que mudou: "Sábado: 09:00–18:00 → fechado".
function oQueMudou(salva: HorarioSerializado[], editada: HorarioSerializado[]): string[] {
  return ORDEM_DA_SEMANA.flatMap((diaSemana) => {
    const antes = salva.find((dia) => dia.diaSemana === diaSemana);
    const depois = editada.find((dia) => dia.diaSemana === diaSemana);
    if (!antes || !depois || horarioDoDia(antes) === horarioDoDia(depois)) return [];
    return [`${comMaiuscula(DIAS[diaSemana]!)}: ${horarioDoDia(antes)} → ${horarioDoDia(depois)}`];
  });
}

// O primeiro dia aberto que fecha antes de abrir (ou sem hora), na ordem
// da semana. "HH:mm" com zero à esquerda compara na ordem do relógio.
function diaInvertido(semana: HorarioSerializado[]): HorarioSerializado | undefined {
  return ORDEM_DA_SEMANA.map((diaSemana) => semana.find((dia) => dia.diaSemana === diaSemana)).find(
    (dia) =>
      !!dia && !dia.fechado && (!dia.horaAbertura || !dia.horaFechamento || dia.horaAbertura >= dia.horaFechamento)
  );
}

// Os três jeitos mais comuns de uma barbearia abrir, a um toque.
const ATALHOS: { rotulo: string; rotina: Rotina }[] = [
  { rotulo: "Seg a sex · 9–18", rotina: { dias: [1, 2, 3, 4, 5], abre: "09:00", fecha: "18:00" } },
  { rotulo: "Seg a sáb · 9–19", rotina: { dias: [1, 2, 3, 4, 5, 6], abre: "09:00", fecha: "19:00" } },
  { rotulo: "Todos os dias · 9–18", rotina: { dias: [0, 1, 2, 3, 4, 5, 6], abre: "09:00", fecha: "18:00" } },
];

// Horários de funcionamento. Redesenho das Configurações (01/11, decisão
// do dono): saiu o cartão "A rotina da semana", que repetia a lista dos
// dias. Os atalhos preenchem a semana direto, cada dia liga e desliga no
// interruptor, e o salvar é a barra de mudanças, como em Regras e Dados.
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
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizar depois do commit (via efeito) deixaria uma janela em que
  // o formulário já mostra os dias mas `semana` ainda é `[]`. A
  // comparação de referência também faz `horariosSalvos.recarregar()`
  // (depois de salvar) sincronizar de novo, uma vez só.
  const [semanaSincronizada, setSemanaSincronizada] = useState<typeof horariosSalvos.dados>(null);
  if (horariosSalvos.dados && horariosSalvos.dados !== semanaSincronizada) {
    setSemanaSincronizada(horariosSalvos.dados);
    setSemana(horariosSalvos.dados);
  }

  function trocarDia(diaSemana: number, mudanca: Partial<HorarioSerializado>) {
    setAviso(undefined);
    setSemana((atual) => atual.map((dia) => (dia.diaSemana === diaSemana ? { ...dia, ...mudanca } : dia)));
  }

  function ligarDia(diaSemana: number, aberto: boolean) {
    // Fechar limpa as horas: a hora antiga junto de fechado guardaria um
    // estado que a API não usa. Reabrir usa o horário mais comum da
    // semana (09:00–18:00 se está tudo fechado).
    const { abre, fecha } = rotinaDaSemana(semana);
    trocarDia(
      diaSemana,
      aberto
        ? { fechado: false, horaAbertura: abre, horaFechamento: fecha }
        : { fechado: true, horaAbertura: null, horaFechamento: null }
    );
  }

  async function salvar() {
    setAviso(undefined);
    const invertido = diaInvertido(semana);
    if (invertido) {
      setAviso(`${comMaiuscula(DIAS[invertido.diaSemana]!)}: a barbearia precisa fechar depois de abrir.`);
      return;
    }
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

  const erro = barbearia.erro ?? horariosSalvos.erro;
  if (erro) return <Aviso>{erro.mensagem || "Não foi possível carregar os horários agora."}</Aviso>;
  // Sem esta trava, o Salvar tocado antes da resposta chegar mandaria
  // `semana` vazio — e sete dias ausentes do corpo fecham a semana
  // inteira na API.
  if (!barbearia.dados || !horariosSalvos.dados) return <Carregando />;
  const salvos = horariosSalvos.dados;

  // A semana na ordem do dono: segunda primeiro.
  const semanaNaOrdem = ORDEM_DA_SEMANA.map((dia) => semana.find((h) => h.diaSemana === dia)).filter(
    (h): h is HorarioSerializado => !!h
  );

  return (
    <MolduraDaArea area="horarios" decididas={decididas}>
      {/* Em duas colunas no desktop: a semana à esquerda, datas e pausas
          à direita. No celular, empilham. */}
      <div className={estilos.gradeDosHorarios}>
        <Secao
          titulo="A semana"
          descricao="Ligue o dia em que abre e acerte o horário. Os atalhos preenchem a semana de uma vez."
        >
          <div className={estilos.atalhos} role="group" aria-label="Preencher a semana com">
            {ATALHOS.map((atalho) => (
              <button
                key={atalho.rotulo}
                type="button"
                className={estilos.atalho}
                onClick={() => {
                  setAviso(undefined);
                  setSemana((atual) => aplicarRotina(atual, atalho.rotina));
                }}
              >
                {atalho.rotulo}
              </button>
            ))}
          </div>

          <ul className={estilos.listaDosDias}>
            {semanaNaOrdem.map((dia) => (
              <li key={dia.diaSemana} className={estilos.dia}>
                <span className={estilos.nomeDoDia}>{comMaiuscula(DIAS[dia.diaSemana]!)}</span>
                {/* Aberto e fechado ocupam a mesma área da grade: a linha
                    não pula quando o dia liga ou desliga. */}
                <div className={estilos.horas}>
                  {dia.fechado ? (
                    <span className={estilos.fechado}>Fechado</span>
                  ) : (
                    <>
                      <Campo
                        // Rótulo curto no olho, nome inteiro pra quem ouve.
                        rotulo="Abre"
                        type="time"
                        aria-label={`Abre ${noDia(dia.diaSemana)}`}
                        valor={dia.horaAbertura ?? ""}
                        onChange={(valor) => trocarDia(dia.diaSemana, { horaAbertura: valor })}
                      />
                      <Campo
                        rotulo="Fecha"
                        type="time"
                        aria-label={`Fecha ${noDia(dia.diaSemana)}`}
                        valor={dia.horaFechamento ?? ""}
                        onChange={(valor) => trocarDia(dia.diaSemana, { horaFechamento: valor })}
                      />
                    </>
                  )}
                </div>
                <span className={estilos.chaveDoDia}>
                  <Interruptor
                    rotulo={`Aberto ${noDia(dia.diaSemana)}`}
                    rotuloOculto
                    ligado={!dia.fechado}
                    aoTrocar={(aberto) => ligarDia(dia.diaSemana, aberto)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Secao>

        <ExcecoesDeHorario aoDecidir={() => marcar("horarios")} />

        <PausasDaEquipe />
      </div>

      <BarraDeMudancas
        mudancas={oQueMudou(salvos, semana)}
        pendente={!decididas.includes("horarios")}
        aviso={aviso}
        salvando={salvando}
        aoSalvar={salvar}
        aoDescartar={() => {
          setAviso(undefined);
          setSemana(salvos);
        }}
      />
    </MolduraDaArea>
  );
}
