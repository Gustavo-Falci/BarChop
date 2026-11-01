"use client";

import { useId, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AntecedenciaDoLembrete } from "@barchop/types";
import { BarraDeMudancas } from "../../../componentes/BarraDeMudancas";
import { Interruptor } from "../../../componentes/Interruptor";
import { Secao } from "../../../componentes/Secao";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import { useRequisicao } from "../../../api/useRequisicao";
import { Aviso } from "../../../componentes/Aviso";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import estilos from "./Configuracoes.module.css";
import estilosDasRegras from "./Regras.module.css";
import { Carregando } from "../../../componentes/Carregando";

// As antecedências que a API aceita, da maior pra menor.
const ANTECEDENCIAS: AntecedenciaDoLembrete[] = [24, 12, 2];

type Lembrete = { lembreteAtivo: boolean; lembreteAntecedenciaHoras: AntecedenciaDoLembrete };

// O "o que mudou" da barra, no jeito das Regras: "nome: antes → depois".
function oQueMudou(original: Lembrete | null, atual: Lembrete): string[] {
  if (!original) return [];
  const mudancas: string[] = [];
  const ligado = (ativo: boolean) => (ativo ? "ligado" : "desligado");
  if (original.lembreteAtivo !== atual.lembreteAtivo) {
    mudancas.push(`Lembrete por e-mail: ${ligado(original.lembreteAtivo)} → ${ligado(atual.lembreteAtivo)}`);
  }
  if (original.lembreteAntecedenciaHoras !== atual.lembreteAntecedenciaHoras) {
    mudancas.push(
      `Quando o lembrete sai: ${original.lembreteAntecedenciaHoras} h antes → ${atual.lembreteAntecedenciaHoras} h antes`
    );
  }
  return mudancas;
}

// Notificações: hoje, o lembrete por e-mail que o cliente recebe antes
// do horário (G2c). Ligado/desligado e a antecedência.
export function NotificacoesDaBarbearia() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") return <SoODono area="notificacoes" />;
  return <Notificacoes />;
}

function Notificacoes() {
  const api = useApiDoPainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const { decididas, marcar } = useAreasDecididas(barbearia.dados?.areasDecididas);
  const [antecedencia, setAntecedencia] = useState<AntecedenciaDoLembrete>(24);
  const [lembreteAtivo, setLembreteAtivo] = useState(true);
  const [original, setOriginal] = useState<Lembrete | null>(null);
  const idDoApoio = useId();
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado na renderização, e não num efeito: ver o comentário de
  // DadosDoNegocio (corrida do 181514d).
  const [sincronizada, setSincronizada] = useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== sincronizada) {
    setSincronizada(barbearia.dados);
    setAntecedencia(barbearia.dados.lembreteAntecedenciaHoras);
    setLembreteAtivo(barbearia.dados.lembreteAtivo);
    setOriginal({
      lembreteAtivo: barbearia.dados.lembreteAtivo,
      lembreteAntecedenciaHoras: barbearia.dados.lembreteAntecedenciaHoras,
    });
  }

  const atual: Lembrete = { lembreteAtivo, lembreteAntecedenciaHoras: antecedencia };

  async function salvar() {
    if (salvando) return;
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMinhaBarbearia(atual);
      setOriginal(atual);
      marcar("notificacoes");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  if (barbearia.erro) {
    return <Aviso>{barbearia.erro.mensagem || "Não foi possível carregar a barbearia agora."}</Aviso>;
  }
  if (!barbearia.dados) return <Carregando />;

  return (
    <MolduraDaArea area="notificacoes" decididas={decididas}>
      <div className={estilos.ladoALado}>
        <Secao
          titulo="Lembrete"
          descricao="O cliente com e-mail recebe um lembrete antes do horário, com um link pra confirmar a presença ou cancelar."
        >
          {/* Num cartão só, de cima pra baixo (redesenho, PR 7): o
              interruptor e, embaixo, quando o lembrete sai. */}
          <div className={estilos.lembrete}>
            {/* O interruptor (G2c), como as regras de sim ou não (PR 4).
                Ligar enfileira na API os agendamentos futuros que ainda
                não têm lembrete. */}
            <div className={estilosDasRegras.regra}>
              <span className={estilosDasRegras.texto}>
                <span className={estilosDasRegras.nome} aria-hidden="true">
                  Enviar lembrete por e-mail
                </span>
                <span id={idDoApoio} className={estilosDasRegras.efeito}>
                  Ao ligar, os agendamentos já marcados também recebem o lembrete.
                </span>
              </span>
              <Interruptor
                rotulo="Enviar lembrete por e-mail"
                rotuloOculto
                ligado={lembreteAtivo}
                aoTrocar={setLembreteAtivo}
                descritoPor={idDoApoio}
              />
            </div>
            <div className={estilos.campoLongo}>
              <SeletorEmPilulas
                nome="antecedencia"
                preencher
                legenda="Quando o lembrete sai"
                opcoes={ANTECEDENCIAS.map((horas) => ({ valor: String(horas), rotulo: `${horas} h antes` }))}
                valor={String(antecedencia)}
                aoTrocar={(valor) => setAntecedencia(Number(valor) as AntecedenciaDoLembrete)}
                efeito={
                  lembreteAtivo
                    ? `O cliente recebe o lembrete ${antecedencia} horas antes do horário.`
                    : "Lembrete desligado: o cliente não recebe e-mail antes do horário."
                }
              />
              {/* A antecedência é lida quando o lembrete é agendado, na hora
                  em que o cliente marca: trocar aqui não move os que já
                  estão programados. */}
              <span className={estilos.apoio}>
                Vale pros próximos agendamentos; os já marcados mantêm o lembrete que tinham.
              </span>
            </div>
          </div>
        </Secao>
      </div>

      {/* Um Salvar só, na barra do pé (redesenho, PR 7). */}
      <BarraDeMudancas
        mudancas={oQueMudou(original, atual)}
        pendente={!decididas.includes("notificacoes")}
        aviso={aviso}
        salvando={salvando}
        aoSalvar={() => void salvar()}
        aoDescartar={() => {
          if (!original) return;
          setLembreteAtivo(original.lembreteAtivo);
          setAntecedencia(original.lembreteAntecedenciaHoras);
        }}
      />
    </MolduraDaArea>
  );
}
