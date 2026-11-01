"use client";

import { useId, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { RegrasDeAgendamento as Regras } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { BarraDeMudancas } from "../../../componentes/BarraDeMudancas";
import { Carregando } from "../../../componentes/Carregando";
import { FolhaDeEscolha } from "../../../componentes/FolhaDeEscolha";
import { Interruptor } from "../../../componentes/Interruptor";
import { Secao } from "../../../componentes/Secao";
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
import estilosDasRegras from "./Regras.module.css";

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
// "o que mudou" da barra de salvar. `chave`: sim ou não, ligado num
// interruptor na própria linha; as outras abrem a folha (PR 4, 01/11).
interface Regra {
  nome: string;
  chave?: true;
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
    chave: true,
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
    chave: true,
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
  // A regra com a folha aberta, pelo nome.
  const [aberta, setAberta] = useState<string | null>(null);

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

  const atuais = regras;
  const regraAberta = [...COMO_MARCA, ...REMARCAR_E_CANCELAR].find((regra) => regra.nome === aberta);

  function lista(doGrupo: Regra[]) {
    return (
      <ul className={estilosDasRegras.regras}>
        {doGrupo.map((regra) => (
          <li key={regra.nome}>
            {regra.chave ? (
              <LinhaDaChave regra={regra} regras={atuais} aoTrocar={trocar} />
            ) : (
              <LinhaDaEscolha regra={regra} regras={atuais} aoAbrir={() => setAberta(regra.nome)} />
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <MolduraDaArea area="regras_de_agendamento" decididas={decididas}>
      {/* As duas seções lado a lado: a tela usa a largura em vez de virar
          uma coluna comprida (pedido do dono). No celular, empilham. */}
      <div className={estilos.ladoALado}>
        <Secao
          titulo="Como o cliente marca"
          descricao="Valem pro link da barbearia. Pelo painel você encaixa qualquer horário livre."
        >
          {lista(COMO_MARCA)}
        </Secao>

        <Secao
          titulo="Remarcar e cancelar"
          descricao="Depois do prazo, os botões somem pro cliente e ele vê o contato da barbearia. Pelo painel você muda a qualquer hora."
        >
          {lista(REMARCAR_E_CANCELAR)}
        </Secao>
      </div>

      {regraAberta ? (
        <FolhaDeEscolha
          titulo={regraAberta.legenda}
          nome={regraAberta.nome}
          opcoes={regraAberta.opcoes}
          valor={regraAberta.valor(atuais)}
          // O efeito da marcada, lido como se já valesse.
          efeito={(valor) => regraAberta.efeito({ ...atuais, ...regraAberta.aplicar(valor) })}
          aoUsar={(valor) => trocar(regraAberta.aplicar(valor))}
          aoFechar={() => setAberta(null)}
        />
      ) : null}

      <BarraDeMudancas
        mudancas={oQueMudou(original, regras)}
        pendente={!decididas.includes("regras_de_agendamento")}
        aviso={aviso}
        salvando={salvando}
        aoSalvar={() => void salvar()}
        aoDescartar={() => setRegras(original)}
      />
    </MolduraDaArea>
  );
}

// A regra de escolha: a linha inteira é o botão que abre a folha. O nome
// acessível é o nome e o valor ("Intervalo entre horários 15 min"); o
// efeito vem como descrição.
function LinhaDaEscolha({ regra, regras, aoAbrir }: { regra: Regra; regras: Regras; aoAbrir: () => void }) {
  const id = useId();
  return (
    <button
      type="button"
      className={estilosDasRegras.regra}
      aria-haspopup="dialog"
      aria-labelledby={`${id}-nome ${id}-valor`}
      aria-describedby={`${id}-efeito`}
      onClick={aoAbrir}
    >
      <span className={estilosDasRegras.texto}>
        <span id={`${id}-nome`} className={estilosDasRegras.nome}>
          {regra.legenda}
        </span>
        <span id={`${id}-efeito`} className={estilosDasRegras.efeito}>
          {regra.efeito(regras)}
        </span>
      </span>
      <span id={`${id}-valor`} className={estilosDasRegras.valor}>
        {rotuloDe(regra, regra.valor(regras))}
      </span>
      <svg
        className={estilosDasRegras.seta}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

// Sim ou não: liga e desliga na hora, sem folha. O efeito muda junto e
// descreve o interruptor.
function LinhaDaChave({
  regra,
  regras,
  aoTrocar,
}: {
  regra: Regra;
  regras: Regras;
  aoTrocar: (campos: Partial<Regras>) => void;
}) {
  const id = useId();
  return (
    <div className={estilosDasRegras.regra}>
      <span className={estilosDasRegras.texto}>
        <span className={estilosDasRegras.nome} aria-hidden="true">
          {regra.legenda}
        </span>
        <span id={`${id}-efeito`} className={estilosDasRegras.efeito} aria-live="polite">
          {regra.efeito(regras)}
        </span>
      </span>
      <Interruptor
        rotulo={regra.legenda}
        rotuloOculto
        ligado={regra.valor(regras) === "sim"}
        aoTrocar={(ligado) => aoTrocar(regra.aplicar(ligado ? "sim" : "nao"))}
        descritoPor={`${id}-efeito`}
      />
    </div>
  );
}
