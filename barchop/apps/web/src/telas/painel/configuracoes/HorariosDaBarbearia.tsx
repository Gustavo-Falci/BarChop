"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { Campo } from "../../../componentes/Campo";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import estilos from "./Configuracoes.module.css";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Horários de funcionamento: os sete dias, abertos ou fechados.
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

  return (
    <MolduraDaArea area="horarios" decididas={decididas} aviso={aviso}>
      <div className={estilos.colunaLarga}>
        <Secao
          titulo="Horário de funcionamento"
          descricao="Define quais horários o cliente consegue escolher. Dia marcado como fechado não aparece na agenda pública."
          acao={
            <Botao onClick={salvar} carregando={salvando}>
              Salvar horários
            </Botao>
          }
        >
          {semana.map((dia) => (
            <div key={dia.diaSemana} className={estilos.dia}>
              <span>{DIAS[dia.diaSemana]}</span>
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
                        : { fechado: false, horaAbertura: "09:00", horaFechamento: "18:00" }
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
      </div>
    </MolduraDaArea>
  );
}
