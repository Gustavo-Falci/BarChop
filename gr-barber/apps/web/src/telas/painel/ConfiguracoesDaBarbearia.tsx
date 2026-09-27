"use client";

import { useState } from "react";
import type { ErroDaApi } from "@gr-barber/api-client";
import {
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "@gr-barber/formato";
import type { HorarioSerializado } from "@gr-barber/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { Secao } from "../../componentes/Secao";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./ConfiguracoesDaBarbearia.module.css";

// O mesmo limite da coluna `sobre` e do schema do PATCH. Cortar na
// digitação evita o 400 que voltaria depois de a pessoa ter escrito o
// texto inteiro.
const SOBRE_MAX = 1000;

const DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

// Vazio vira null, que é o que a API aceita pra limpar o campo; string
// vazia seria 400 do pattern.
function telefoneOuNulo(digitado: string): string | null {
  return digitado.trim() ? normalizarTelefoneObrigatorio(digitado) : null;
}

export function ConfiguracoesDaBarbearia() {
  const api = useApiDoPainel();
  const { perfil, slug } = usePainel();

  const horariosSalvos = useRequisicao(() => api.barbeiro.horarios(), []);

  const [nomeDaBarbearia, setNomeDaBarbearia] = useState("");
  const [telefoneDaBarbearia, setTelefoneDaBarbearia] = useState("");
  const [endereco, setEndereco] = useState("");
  const [sobre, setSobre] = useState("");
  const [semana, setSemana] = useState<HorarioSerializado[]>([]);
  const [nome, setNome] = useState(perfil.nome);
  const [telefone, setTelefone] = useState(perfil.telefone ?? "");
  const [erro, setErro] = useState<Record<string, string | undefined>>({});
  const [aviso, setAviso] = useState<string | undefined>();
  // Um só, e não um por bloco: só um bloco costuma estar em edição por
  // vez, e os três já guardam estado separado — dividir a trava não
  // ganharia isolamento nenhum, só triplicaria o boilerplate. Mesma
  // escolha de DetalheDoAgendamento, que também tem vários botões e um
  // `salvando` só.
  const [salvando, setSalvando] = useState(false);

  // A API tem PATCH /barbearias/me e nenhum GET: a única leitura dos
  // dados da própria barbearia é a rota pública por slug. Daí o painel
  // precisar do escopo publico também aqui, e não só na
  // disponibilidade.
  const barbearia = useRequisicao(
    () => api.publico.perfilDaBarbearia(slug),
    [slug],
  );

  // Sincronizado durante a renderização, e não num `useEffect`: um
  // efeito só roda depois do commit, e entre o commit e o efeito o
  // formulário já teria aparecido com o campo vazio — digitar nessa
  // janela corre contra o preenchimento e perde o que a pessoa
  // escreveu. Foi exatamente isso que aconteceu sob carga real: as duas
  // buscas (`barbearia` e `horariosSalvos`) resolvendo no mesmo lote
  // deixa o primeiro commit do formulário com `nomeDaBarbearia` ainda
  // "", e sob contenção de CPU o efeito de preenchimento nem sempre
  // termina antes do próximo passo do teste — valor observado em
  // produção de teste: "GR BarberGR Barber Centro" (o preenchido em
  // cima do que já tinha sido digitado). A trava de carregamento (mais
  // abaixo) olha se os dados chegaram, não se o estado local já foi
  // sincronizado com eles — por isso não fecha essa janela sozinha.
  // Sincronizar aqui evita o commit intermediário: o React descarta
  // essa renderização e refaz com o valor certo antes de pintar
  // qualquer coisa. O `!==` contra o rastreador é o que impede o loop
  // — sem ele, cada chamada de setState re-renderizaria e cairia na
  // mesma condição outra vez.
  const [barbeariaSincronizada, setBarbeariaSincronizada] =
    useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== barbeariaSincronizada) {
    setBarbeariaSincronizada(barbearia.dados);
    setNomeDaBarbearia(barbearia.dados.nome);
    setTelefoneDaBarbearia(barbearia.dados.telefone ?? "");
    setEndereco(barbearia.dados.endereco ?? "");
    setSobre(barbearia.dados.sobre ?? "");
  }

  // Mesmo motivo do bloco acima, aplicado à semana: sincronizar depois
  // do commit (via efeito) deixaria uma janela em que o formulário já
  // mostra os dias mas `semana` ainda é `[]`. A comparação de
  // referência também é o que faz `horariosSalvos.recarregar()` (depois
  // de salvar) sincronizar de novo — o array novo que a rota devolve
  // não é `===` ao antigo, então a condição volta a ser verdadeira uma
  // vez, e só uma.
  const [semanaSincronizada, setSemanaSincronizada] =
    useState<typeof horariosSalvos.dados>(null);
  if (horariosSalvos.dados && horariosSalvos.dados !== semanaSincronizada) {
    setSemanaSincronizada(horariosSalvos.dados);
    setSemana(horariosSalvos.dados);
  }

  async function salvarDados() {
    setAviso(undefined);
    setErro({});
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMinhaBarbearia({
        nome: nomeDaBarbearia.trim(),
        telefone: telefoneOuNulo(telefoneDaBarbearia),
        endereco: endereco.trim() || null,
        // Vazio vira `null`, não string vazia: é `null` que a home lê
        // como "esta barbearia ainda não escreveu apresentação" e
        // esconde a seção. Uma string vazia desenharia um bloco em
        // branco.
        sobre: sobre.trim() || null,
      });
    } catch (causa) {
      if (causa instanceof TelefoneInvalido) {
        setErro({
          telefoneDaBarbearia: "Informe o DDD e o número, como (11) 99999-8888",
        });
        return;
      }
      setAviso(
        (causa as ErroDaApi).mensagem || "Não foi possível salvar agora.",
      );
    } finally {
      // `finally`, e não uma linha solta no fim: o catch acima tem um
      // `return` no meio (telefone inválido), que pularia uma linha
      // solta e deixaria o botão travado depois do primeiro erro desse
      // tipo.
      setSalvando(false);
    }
  }

  async function salvarHorarios() {
    setAviso(undefined);
    setSalvando(true);
    try {
      // A semana inteira, sempre: dia ausente do corpo vira fechado na
      // API, de propósito — "sem linha" e "fechado" são estados
      // diferentes pro cálculo de disponibilidade.
      await api.barbeiro.salvarHorarios(semana);
      horariosSalvos.recarregar();
    } catch (causa) {
      setAviso(
        (causa as ErroDaApi).mensagem || "Não foi possível salvar agora.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function salvarPerfil() {
    setAviso(undefined);
    setErro({});
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMeuPerfil({
        nome: nome.trim(),
        telefone: telefoneOuNulo(telefone),
      });
    } catch (causa) {
      if (causa instanceof TelefoneInvalido) {
        setErro({ telefone: "Informe o DDD e o número, como (11) 99999-8888" });
        return;
      }
      setAviso(
        (causa as ErroDaApi).mensagem || "Não foi possível salvar agora.",
      );
    } finally {
      setSalvando(false);
    }
  }

  function trocarDia(diaSemana: number, mudanca: Partial<HorarioSerializado>) {
    setSemana((atual) =>
      atual.map((dia) =>
        dia.diaSemana === diaSemana ? { ...dia, ...mudanca } : dia,
      ),
    );
  }

  // Sem esta trava, "Salvar horários" clicado antes da resposta chegar
  // mandaria `semana` vazio — e sete dias ausentes do corpo fecham a
  // semana inteira na API (mesma regra do PUT). O mesmo vale pro nome
  // da barbearia: sem esperar `barbearia.dados`, digitar corre contra o
  // preenchimento assíncrono do campo e perde a digitação — o mesmo
  // problema que a guarda de sessão resolve pro perfil, aqui pros dois
  // outros GETs da tela.
  if (barbearia.erro) {
    return (
      <Aviso>
        {barbearia.erro.mensagem ||
          "Não foi possível carregar a barbearia agora."}
      </Aviso>
    );
  }
  if (horariosSalvos.erro) {
    return (
      <Aviso>
        {horariosSalvos.erro.mensagem ||
          "Não foi possível carregar os horários agora."}
      </Aviso>
    );
  }
  if (!barbearia.dados || !horariosSalvos.dados) return <p>Carregando…</p>;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Configurações"
        apoio="Dados da barbearia, horário de funcionamento e seu perfil."
      />
      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {/* Duas colunas no desktop. Barbearia e Seu perfil são
          formulários curtos e empilham numa coluna; Horário de
          funcionamento é alto e largo e fica na outra, de modo que as
          duas colunas terminem mais ou menos na mesma altura.

          O perfil vem antes do horário no DOM porque é onde ele
          aparece na tela — ordem de foco que não bate com a ordem
          visual faz o Tab pular de um canto pro outro. */}
      <div className={estilos.grade}>
        <div className={estilos.coluna}>
          <Secao
            titulo="Barbearia"
            descricao="O que o cliente vê na página pública de agendamento."
            acao={
              <Botao onClick={salvarDados} carregando={salvando}>
                Salvar dados
              </Botao>
            }
          >
            <Campo
              rotulo="Nome da barbearia"
              valor={nomeDaBarbearia}
              onChange={setNomeDaBarbearia}
            />
            <Campo
              rotulo="Telefone da barbearia"
              formato="telefone"
              valor={telefoneDaBarbearia}
              onChange={setTelefoneDaBarbearia}
              erro={erro.telefoneDaBarbearia}
            />
            <Campo rotulo="Endereço" valor={endereco} onChange={setEndereco} />

            {/* <textarea> à mão, e não o Campo: ele é um <input>, e este
                texto tem parágrafos. Dar um modo multilinha ao Campo
                significaria mais um ramo dentro de um componente que dez
                telas usam — e o que se reaproveitaria seria o rótulo e o
                erro, não o input. Aqui é uma tela só. */}
            <div className={estilos.campoLongo}>
              <label className={estilos.rotulo} htmlFor="sobre">
                Sobre a barbearia
              </label>
              <span className={estilos.apoio} id="sobre-apoio">
                Aparece na sua página pública, embaixo do nome. Conte o que a
                barbearia tem de diferente.
              </span>
              <textarea
                id="sobre"
                className={estilos.area}
                aria-describedby="sobre-apoio"
                rows={5}
                maxLength={SOBRE_MAX}
                value={sobre}
                onChange={(evento) => setSobre(evento.target.value)}
              />
              {/* O contador existe porque o limite é do banco: passar
                  dele viraria 400, e sem aviso a pessoa só descobriria
                  ao salvar um texto que levou minutos escrevendo. */}
              <span className={estilos.contador}>
                {sobre.length} de {SOBRE_MAX}
              </span>
            </div>
          </Secao>
          <Secao
            titulo="Seu perfil"
            descricao="Seus dados como barbeiro, separados dos dados da barbearia."
            acao={
              <Botao onClick={salvarPerfil} carregando={salvando}>
                Salvar perfil
              </Botao>
            }
          >
            <Campo rotulo="Seu nome" valor={nome} onChange={setNome} />
            <Campo
              rotulo="Seu telefone"
              formato="telefone"
              valor={telefone}
              onChange={setTelefone}
              erro={erro.telefone}
            />
          </Secao>
        </div>

        <Secao
          titulo="Horário de funcionamento"
          descricao="Define quais horários o cliente consegue escolher. Dia marcado como fechado não aparece na agenda pública."
          acao={
            <Botao onClick={salvarHorarios} carregando={salvando}>
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
                    // Fechar limpa as horas: deixar a hora antiga junto de
                    // fechado guardaria um estado que a API não usa e que
                    // a próxima leitura reexibiria.
                    trocarDia(
                      dia.diaSemana,
                      evento.target.checked
                        ? {
                            fechado: true,
                            horaAbertura: null,
                            horaFechamento: null,
                          }
                        : {
                            fechado: false,
                            horaAbertura: "09:00",
                            horaFechamento: "18:00",
                          },
                    )
                  }
                />
                fechado
              </label>
              {/* Os dois campos entram embrulhados, e não soltos: a linha
                é um grid de três colunas, e quatro filhos jogavam o
                "fecha" pra uma segunda linha, na coluna do nome do dia.
                Com o embrulho, aberto e fechado têm o mesmo número de
                filhos e as colunas continuam alinhadas entre os dias. */}
              <div className={estilos.horas}>
                {dia.fechado ? null : (
                  <>
                    <Campo
                      // Rótulo curto no olho, nome inteiro pra quem ouve:
                      // sete campos "Abre" na mesma tela não se distinguem
                      // por voz, e repetir o dia em cada rótulo visível
                      // fazia a coluna crescer e quebrar em duas linhas.
                      rotulo="Abre"
                      type="time"
                      aria-label={`Abre na ${DIAS[dia.diaSemana]}`}
                      valor={dia.horaAbertura ?? ""}
                      onChange={(valor) =>
                        trocarDia(dia.diaSemana, { horaAbertura: valor })
                      }
                    />
                    <Campo
                      rotulo="Fecha"
                      type="time"
                      aria-label={`Fecha na ${DIAS[dia.diaSemana]}`}
                      valor={dia.horaFechamento ?? ""}
                      onChange={(valor) =>
                        trocarDia(dia.diaSemana, { horaFechamento: valor })
                      }
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </Secao>
      </div>
    </div>
  );
}
