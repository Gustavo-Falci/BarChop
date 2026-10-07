"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { EdicaoDeExcecao, ExcecaoDeHorario } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { Campo } from "../../../componentes/Campo";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { formatarDataComSemana } from "../../../formato/datas";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import estilos from "./Configuracoes.module.css";

// O que vale na data, numa linha: "Fechado · Natal", "09:00–13:00".
function oQueVale(excecao: ExcecaoDeHorario): string {
  const horario = excecao.fechado ? "Fechado" : `${excecao.horaAbertura}–${excecao.horaFechamento}`;
  return excecao.motivo ? `${horario} · ${excecao.motivo}` : horario;
}

function avisoDosMarcados(quantos: number): string {
  const agendamentos = quantos === 1 ? "1 agendamento já marcado" : `${quantos} agendamentos já marcados`;
  return `Data salva. ${agendamentos} nessa data fica${quantos === 1 ? "" : "m"} fora do horário — continua${quantos === 1 ? "" : "m"} na agenda: remarque ou cancele pela Agenda.`;
}

// Datas especiais (painel v2, marco 3): na data, vale isto no lugar do
// horário da semana, pra toda a equipe — feriado fechado ou horário
// diferente. Ausência de uma pessoa só continua sendo bloqueio (Folgas).
// Os agendamentos já marcados não mudam; a API diz quantos ficam fora e
// a tela avisa.
export function ExcecoesDeHorario({ aoDecidir }: { aoDecidir: () => void }) {
  const api = useApiDoPainel();
  const salvas = useRequisicao(() => api.barbeiro.excecoesDeHorario(), []);

  const [data, setData] = useState("");
  const [fechado, setFechado] = useState(true);
  const [abre, setAbre] = useState("09:00");
  const [fecha, setFecha] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [aviso, setAviso] = useState<{ tom: "sucesso" | "atencao"; texto: string } | undefined>();
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    setErro(undefined);
    setAviso(undefined);
    if (!data) {
      setErro("Escolha a data.");
      return;
    }
    // "HH:mm" compara como texto na ordem do relógio.
    if (!fechado && (!abre || !fecha || abre >= fecha)) {
      setErro("Na data, a barbearia precisa fechar depois de abrir.");
      return;
    }

    const edicao: EdicaoDeExcecao = fechado
      ? { fechado: true }
      : { fechado: false, horaAbertura: abre, horaFechamento: fecha };
    edicao.motivo = motivo.trim() || null;

    setSalvando(true);
    try {
      const { foraDoHorario } = await api.barbeiro.salvarExcecaoDeHorario(data, edicao);
      aoDecidir();
      salvas.recarregar();
      setData("");
      setMotivo("");
      setAviso(
        foraDoHorario > 0
          ? { tom: "atencao", texto: avisoDosMarcados(foraDoHorario) }
          : { tom: "sucesso", texto: "Data salva." }
      );
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível salvar a data agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(excecao: ExcecaoDeHorario) {
    setErro(undefined);
    setAviso(undefined);
    try {
      await api.barbeiro.apagarExcecaoDeHorario(excecao.data);
      salvas.recarregar();
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível remover a data agora.");
    }
  }

  return (
    <Secao
      titulo="Datas especiais"
      descricao="Feriado ou dia com horário diferente. Na data, vale isto no lugar do horário da semana, pra toda a equipe."
    >
      {salvas.erro ? <Aviso>{salvas.erro.mensagem || "Não foi possível carregar as datas agora."}</Aviso> : null}
      {salvas.dados && salvas.dados.length === 0 ? (
        <p className={estilos.valor}>Nenhuma data especial.</p>
      ) : null}
      {salvas.dados && salvas.dados.length > 0 ? (
        <ul className={estilos.lista}>
          {salvas.dados.map((excecao) => {
            const quando = formatarDataComSemana(excecao.data);
            return (
              <li key={excecao.data} className={estilos.linhaDaData}>
                <strong className={estilos.nomeDaArea}>{quando}</strong>
                <span className={estilos.valor}>{oQueVale(excecao)}</span>
                <Botao variante="fantasma" aria-label={`Remover ${quando}`} onClick={() => remover(excecao)}>
                  Remover
                </Botao>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className={estilos.novaData}>
        <Campo rotulo="Data" type="date" valor={data} onChange={setData} />
        <label className={estilos.marcaDaData}>
          <input type="checkbox" checked={fechado} onChange={(evento) => setFechado(evento.target.checked)} />
          Fechado o dia todo
        </label>
        {fechado ? null : (
          <div className={estilos.horas}>
            <Campo rotulo="Abre" type="time" aria-label="Abre na data" valor={abre} onChange={setAbre} />
            <Campo rotulo="Fecha" type="time" aria-label="Fecha na data" valor={fecha} onChange={setFecha} />
          </div>
        )}
        <Campo rotulo="Motivo (opcional)" valor={motivo} onChange={setMotivo} maxLength={120} />
        <div>
          <Botao variante="contorno" onClick={adicionar} carregando={salvando}>
            Adicionar data
          </Botao>
        </div>
      </div>

      {erro ? <Aviso>{erro}</Aviso> : null}
      {aviso ? <Aviso tom={aviso.tom}>{aviso.texto}</Aviso> : null}
    </Secao>
  );
}
