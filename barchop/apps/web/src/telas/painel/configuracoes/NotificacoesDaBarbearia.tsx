"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AntecedenciaDoLembrete } from "@barchop/types";
import { Botao } from "../../../componentes/Botao";
import { Secao } from "../../../componentes/Secao";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import { useRequisicao } from "../../../api/useRequisicao";
import { Aviso } from "../../../componentes/Aviso";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import estilos from "./Configuracoes.module.css";

// As antecedências que a API aceita, da maior pra menor.
const ANTECEDENCIAS: AntecedenciaDoLembrete[] = [24, 12, 2];

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
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado na renderização, e não num efeito: ver o comentário de
  // DadosDoNegocio (corrida do 181514d).
  const [sincronizada, setSincronizada] = useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== sincronizada) {
    setSincronizada(barbearia.dados);
    setAntecedencia(barbearia.dados.lembreteAntecedenciaHoras);
    setLembreteAtivo(barbearia.dados.lembreteAtivo);
  }

  async function salvar() {
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMinhaBarbearia({ lembreteAtivo, lembreteAntecedenciaHoras: antecedencia });
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
  if (!barbearia.dados) return <p>Carregando…</p>;

  return (
    <MolduraDaArea area="notificacoes" decididas={decididas} aviso={aviso}>
      <div className={estilos.ladoALado}>
        <Secao
          titulo="Lembrete"
          descricao="O cliente com e-mail recebe um lembrete antes do horário, com um link pra confirmar a presença ou cancelar."
          acao={
            <Botao onClick={salvar} carregando={salvando}>
              Salvar lembrete
            </Botao>
          }
        >
          {/* O interruptor à esquerda, a antecedência à direita: a seção
              usa a largura (pedido do dono). */}
          <div className={estilos.ladoALado}>
            <div className={estilos.campoLongo}>
              {/* O interruptor (G2c). Ligar enfileira na API os agendamentos
                  futuros que ainda não têm lembrete. */}
              <label className={estilos.chave}>
                <input
                  type="checkbox"
                  aria-describedby="lembrete-ativo-apoio"
                  checked={lembreteAtivo}
                  onChange={(evento) => setLembreteAtivo(evento.target.checked)}
                />
                Enviar lembrete por e-mail
              </label>
              <span className={estilos.apoio} id="lembrete-ativo-apoio">
                Ao ligar, os agendamentos já marcados também recebem o lembrete.
              </span>
            </div>
            <div className={estilos.campoLongo}>
              <SeletorEmPilulas
                nome="antecedencia"
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
    </MolduraDaArea>
  );
}
