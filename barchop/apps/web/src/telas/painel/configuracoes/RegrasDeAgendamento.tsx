"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { RegrasDeAgendamento as Regras } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { BarraDeMudancas } from "../../../componentes/BarraDeMudancas";
import { Carregando } from "../../../componentes/Carregando";
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

function simNao(valor: boolean): "sim" | "nao" {
  return valor ? "sim" : "nao";
}

// As sete regras numa lista só, cada uma com o valor que o seletor lê, o
// que a escolha grava e a frase do efeito. A lista é também o que monta o
// "o que mudou" da barra de salvar.
interface Regra {
  nome: string;
  legenda: string;
  opcoes: { valor: string; rotulo: string }[];
  valor: (regras: Regras) => string;
  aplicar: (valor: string) => Partial<Regras>;
  efeito: (regras: Regras) => string;
}

const COMO_MARCA: Regra[] = [
  {
    nome: "intervalo",
    legenda: "Intervalo entre horários",
    opcoes: OPCOES_DE_INTERVALO,
    valor: (r) => String(r.intervaloMinutos),
    aplicar: (v) => ({ intervaloMinutos: Number(v) as Regras["intervaloMinutos"] }),
    efeito: (r) => efeitoDoIntervalo(r.intervaloMinutos),
  },
  {
    nome: "antecedencia-minima",
    legenda: "Antecedência mínima",
    opcoes: OPCOES_DE_ANTECEDENCIA,
    valor: (r) => String(r.antecedenciaMinutos),
    aplicar: (v) => ({ antecedenciaMinutos: Number(v) as Regras["antecedenciaMinutos"] }),
    efeito: (r) => efeitoDaAntecedencia(r.antecedenciaMinutos),
  },
  {
    nome: "mesmo-dia",
    legenda: "Marcar no mesmo dia",
    opcoes: OPCOES_SIM_NAO,
    valor: (r) => simNao(r.aceitaMesmoDia),
    aplicar: (v) => ({ aceitaMesmoDia: v === "sim" }),
    efeito: (r) => efeitoDoMesmoDia(r.aceitaMesmoDia),
  },
  {
    nome: "janela",
    legenda: "Até quando a agenda abre",
    opcoes: OPCOES_DE_JANELA,
    valor: (r) => (r.janelaDias === null ? "sem" : String(r.janelaDias)),
    aplicar: (v) => ({ janelaDias: v === "sem" ? null : (Number(v) as Regras["janelaDias"]) }),
    efeito: (r) => efeitoDaJanela(r.janelaDias),
  },
  {
    nome: "cabe-antes-de-fechar",
    legenda: "Serviço precisa caber antes de fechar",
    opcoes: OPCOES_SIM_NAO,
    valor: (r) => simNao(r.cabeAntesDeFechar),
    aplicar: (v) => ({ cabeAntesDeFechar: v === "sim" }),
    efeito: (r) => efeitoDoCabe(r.cabeAntesDeFechar),
  },
];

const REMARCAR_E_CANCELAR: Regra[] = [
  {
    nome: "prazo-remarcar",
    legenda: "Cliente remarca até",
    opcoes: OPCOES_DE_PRAZO,
    valor: (r) => String(r.prazoRemarcarHoras),
    aplicar: (v) => ({ prazoRemarcarHoras: Number(v) as Regras["prazoRemarcarHoras"] }),
    efeito: (r) => efeitoDoPrazo(r.prazoRemarcarHoras, "remarca"),
  },
  {
    nome: "prazo-cancelar",
    legenda: "Cliente cancela até",
    opcoes: OPCOES_DE_PRAZO,
    valor: (r) => String(r.prazoCancelarHoras),
    aplicar: (v) => ({ prazoCancelarHoras: Number(v) as Regras["prazoCancelarHoras"] }),
    efeito: (r) => efeitoDoPrazo(r.prazoCancelarHoras, "cancela"),
  },
];

function rotuloDe(regra: Regra, valor: string): string {
  return regra.opcoes.find((opcao) => opcao.valor === valor)?.rotulo ?? valor;
}

// "Intervalo entre horários: 15 min → 30 min", uma por regra que mudou.
function oQueMudou(original: Regras, atual: Regras): string[] {
  return [...COMO_MARCA, ...REMARCAR_E_CANCELAR]
    .filter((regra) => regra.valor(original) !== regra.valor(atual))
    .map(
      (regra) =>
        `${regra.legenda}: ${rotuloDe(regra, regra.valor(original))} → ${rotuloDe(regra, regra.valor(atual))}`
    );
}

function TelaDasRegras() {
  const api = useApiDoPainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const { decididas, marcar } = useAreasDecididas(barbearia.dados?.areasDecididas);
  const [original, setOriginal] = useState<Regras | null>(null);
  const [regras, setRegras] = useState<Regras | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado na renderização, e não num efeito: ver o comentário de
  // DadosDoNegocio (corrida do 181514d).
  const [sincronizada, setSincronizada] = useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== sincronizada) {
    setSincronizada(barbearia.dados);
    const {
      intervaloMinutos,
      antecedenciaMinutos,
      aceitaMesmoDia,
      janelaDias,
      cabeAntesDeFechar,
      prazoRemarcarHoras,
      prazoCancelarHoras,
    } = barbearia.dados;
    const lidas = {
      intervaloMinutos,
      antecedenciaMinutos,
      aceitaMesmoDia,
      janelaDias,
      cabeAntesDeFechar,
      prazoRemarcarHoras,
      prazoCancelarHoras,
    };
    setOriginal(lidas);
    setRegras(lidas);
  }

  function trocar(campos: Partial<Regras>) {
    setRegras((atuais) => (atuais ? { ...atuais, ...campos } : atuais));
  }

  // As sete de uma vez: um Salvar só por tela (análise de 17/10).
  async function salvar() {
    if (!regras) return;
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMinhaBarbearia(regras);
      setOriginal(regras);
      marcar("regras_de_agendamento");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  if (barbearia.erro) {
    return <Aviso>{barbearia.erro.mensagem || "Não foi possível carregar a barbearia agora."}</Aviso>;
  }
  if (!barbearia.dados || !regras || !original) return <Carregando />;

  function seletor(regra: Regra, atuais: Regras) {
    return (
      <SeletorEmPilulas
        key={regra.nome}
        nome={regra.nome}
        legenda={regra.legenda}
        opcoes={regra.opcoes}
        valor={regra.valor(atuais)}
        aoTrocar={(valor) => trocar(regra.aplicar(valor))}
        efeito={regra.efeito(atuais)}
      />
    );
  }

  return (
    <MolduraDaArea area="regras_de_agendamento" decididas={decididas} aviso={aviso}>
      {/* As duas seções lado a lado: a tela usa a largura em vez de virar
          uma coluna comprida (pedido do dono). No celular, empilham. */}
      <div className={estilos.ladoALado}>
        <Secao
          titulo="Como o cliente marca"
          descricao="Valem pro link da barbearia. Pelo painel você encaixa qualquer horário livre."
        >
          {COMO_MARCA.map((regra) => seletor(regra, regras))}
        </Secao>

        <Secao
          titulo="Remarcar e cancelar"
          descricao="Depois do prazo, os botões somem pro cliente e ele vê o contato da barbearia. Pelo painel você muda a qualquer hora."
        >
          {REMARCAR_E_CANCELAR.map((regra) => seletor(regra, regras))}
        </Secao>
      </div>

      <BarraDeMudancas
        mudancas={oQueMudou(original, regras)}
        pendente={!decididas.includes("regras_de_agendamento")}
        salvando={salvando}
        aoSalvar={() => void salvar()}
        aoDescartar={() => setRegras(original)}
      />
    </MolduraDaArea>
  );
}
