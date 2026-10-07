"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { RegrasDeAgendamento as Regras } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { Secao } from "../../../componentes/Secao";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import {
  OPCOES_DE_ANTECEDENCIA,
  OPCOES_DE_INTERVALO,
  OPCOES_DE_JANELA,
  OPCOES_DE_PRAZO,
  OPCOES_SIM_NAO,
  efeitoDaAntecedencia,
  efeitoDaJanela,
  efeitoDoCabe,
  efeitoDoIntervalo,
  efeitoDoMesmoDia,
  efeitoDoPrazo,
} from "./regras";
import estilos from "./Configuracoes.module.css";

// Regras de agendamento (painel v2, marco 3): como o cliente marca,
// remarca e cancela pelo link. O painel não passa por nenhuma — encaixa
// livre. Cada escolha diz numa frase o que o cliente vai ver.
export function RegrasDeAgendamento() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") return <SoODono area="regras_de_agendamento" />;
  return <TelaDasRegras />;
}

type CamposDeMarcar = Pick<
  Regras,
  "intervaloMinutos" | "antecedenciaMinutos" | "aceitaMesmoDia" | "janelaDias" | "cabeAntesDeFechar"
>;
type CamposDePrazo = Pick<Regras, "prazoRemarcarHoras" | "prazoCancelarHoras">;

function simNao(valor: boolean): "sim" | "nao" {
  return valor ? "sim" : "nao";
}

function TelaDasRegras() {
  const api = useApiDoPainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const { decididas, marcar } = useAreasDecididas(barbearia.dados?.areasDecididas);
  const [regras, setRegras] = useState<Regras | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState<"marcar" | "prazos" | null>(null);

  // Sincronizado na renderização, e não num efeito: ver o comentário de
  // DadosDoNegocio (corrida do 181514d).
  const [sincronizada, setSincronizada] = useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== sincronizada) {
    setSincronizada(barbearia.dados);
    const { intervaloMinutos, antecedenciaMinutos, aceitaMesmoDia, janelaDias, cabeAntesDeFechar } =
      barbearia.dados;
    const { prazoRemarcarHoras, prazoCancelarHoras } = barbearia.dados;
    setRegras({
      intervaloMinutos,
      antecedenciaMinutos,
      aceitaMesmoDia,
      janelaDias,
      cabeAntesDeFechar,
      prazoRemarcarHoras,
      prazoCancelarHoras,
    });
  }

  function trocar(campos: Partial<Regras>) {
    setRegras((atuais) => (atuais ? { ...atuais, ...campos } : atuais));
  }

  async function salvar(qual: "marcar" | "prazos", campos: CamposDeMarcar | CamposDePrazo) {
    setAviso(undefined);
    setSalvando(qual);
    try {
      await api.barbeiro.atualizarMinhaBarbearia(campos);
      marcar("regras_de_agendamento");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      setSalvando(null);
    }
  }

  if (barbearia.erro) {
    return <Aviso>{barbearia.erro.mensagem || "Não foi possível carregar a barbearia agora."}</Aviso>;
  }
  if (!barbearia.dados || !regras) return <p>Carregando…</p>;

  return (
    <MolduraDaArea area="regras_de_agendamento" decididas={decididas} aviso={aviso}>
      {/* As duas seções lado a lado: a tela usa a largura em vez de virar
          uma coluna comprida (pedido do dono). No celular, empilham. */}
      <div className={estilos.ladoALado}>
        <Secao
          titulo="Como o cliente marca"
          descricao="Valem pro link da barbearia. Pelo painel você encaixa qualquer horário livre."
          acao={
            <Botao
              onClick={() =>
                salvar("marcar", {
                  intervaloMinutos: regras.intervaloMinutos,
                  antecedenciaMinutos: regras.antecedenciaMinutos,
                  aceitaMesmoDia: regras.aceitaMesmoDia,
                  janelaDias: regras.janelaDias,
                  cabeAntesDeFechar: regras.cabeAntesDeFechar,
                })
              }
              carregando={salvando === "marcar"}
            >
              Salvar regras de marcar
            </Botao>
          }
        >
          <SeletorEmPilulas
            nome="intervalo"
            legenda="Intervalo entre horários"
            opcoes={OPCOES_DE_INTERVALO}
            valor={String(regras.intervaloMinutos)}
            aoTrocar={(valor) => trocar({ intervaloMinutos: Number(valor) as Regras["intervaloMinutos"] })}
            efeito={efeitoDoIntervalo(regras.intervaloMinutos)}
          />
          <SeletorEmPilulas
            nome="antecedencia-minima"
            legenda="Antecedência mínima"
            opcoes={OPCOES_DE_ANTECEDENCIA}
            valor={String(regras.antecedenciaMinutos)}
            aoTrocar={(valor) =>
              trocar({ antecedenciaMinutos: Number(valor) as Regras["antecedenciaMinutos"] })
            }
            efeito={efeitoDaAntecedencia(regras.antecedenciaMinutos)}
          />
          <SeletorEmPilulas
            nome="mesmo-dia"
            legenda="Marcar no mesmo dia"
            opcoes={OPCOES_SIM_NAO}
            valor={simNao(regras.aceitaMesmoDia)}
            aoTrocar={(valor) => trocar({ aceitaMesmoDia: valor === "sim" })}
            efeito={efeitoDoMesmoDia(regras.aceitaMesmoDia)}
          />
          <SeletorEmPilulas
            nome="janela"
            legenda="Até quando a agenda abre"
            opcoes={OPCOES_DE_JANELA}
            valor={regras.janelaDias === null ? "sem" : String(regras.janelaDias)}
            aoTrocar={(valor) =>
              trocar({ janelaDias: valor === "sem" ? null : (Number(valor) as Regras["janelaDias"]) })
            }
            efeito={efeitoDaJanela(regras.janelaDias)}
          />
          <SeletorEmPilulas
            nome="cabe-antes-de-fechar"
            legenda="Serviço precisa caber antes de fechar"
            opcoes={OPCOES_SIM_NAO}
            valor={simNao(regras.cabeAntesDeFechar)}
            aoTrocar={(valor) => trocar({ cabeAntesDeFechar: valor === "sim" })}
            efeito={efeitoDoCabe(regras.cabeAntesDeFechar)}
          />
        </Secao>

        <Secao
          titulo="Remarcar e cancelar"
          descricao="Depois do prazo, os botões somem pro cliente e ele vê o contato da barbearia. Pelo painel você muda a qualquer hora."
          acao={
            <Botao
              onClick={() =>
                salvar("prazos", {
                  prazoRemarcarHoras: regras.prazoRemarcarHoras,
                  prazoCancelarHoras: regras.prazoCancelarHoras,
                })
              }
              carregando={salvando === "prazos"}
            >
              Salvar prazos
            </Botao>
          }
        >
          <SeletorEmPilulas
            nome="prazo-remarcar"
            legenda="Cliente remarca até"
            opcoes={OPCOES_DE_PRAZO}
            valor={String(regras.prazoRemarcarHoras)}
            aoTrocar={(valor) =>
              trocar({ prazoRemarcarHoras: Number(valor) as Regras["prazoRemarcarHoras"] })
            }
            efeito={efeitoDoPrazo(regras.prazoRemarcarHoras, "remarca")}
          />
          <SeletorEmPilulas
            nome="prazo-cancelar"
            legenda="Cliente cancela até"
            opcoes={OPCOES_DE_PRAZO}
            valor={String(regras.prazoCancelarHoras)}
            aoTrocar={(valor) =>
              trocar({ prazoCancelarHoras: Number(valor) as Regras["prazoCancelarHoras"] })
            }
            efeito={efeitoDoPrazo(regras.prazoCancelarHoras, "cancela")}
          />
        </Secao>
      </div>
    </MolduraDaArea>
  );
}
