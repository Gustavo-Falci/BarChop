"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./CadastroDeServico.module.css";

// Os limites abaixo ESPELHAM o schema de apps/api/src/routers/servicos.ts.
// Divergir não é detalhe de formulário: o que a guarda deixa passar
// volta como 400 de schema, com uma frase de ajv ("must be multiple of
// 5") que o barbeiro não tem como agir — e era justamente pra evitar
// isso que estas funções existem. Mexer no schema da API sem mexer aqui
// reabre o buraco em silêncio, porque nada liga os dois arquivos.
const NOME_MIN = 2;
const NOME_MAX = 120;
const DURACAO_MIN = 5;
const DURACAO_MAX = 480;
// O passo de 5 mantém o cadastro alinhado com a grade de horários
// sugeridos; o teto existe porque um serviço de 2000 minutos faria o
// `horaFim` do agendamento passar da meia-noite.
const DURACAO_PASSO = 5;
// PADRAO_PRECO aceita no máximo 8 dígitos na parte inteira.
const PRECO_INTEIRO_MAX = 8;

// Um resultado, e não `T | null`: com null a tela tinha uma mensagem só
// por campo, e "30 não serve" e "7 não serve" precisam dizer coisas
// diferentes — a segunda tem conserto óbvio, a primeira não.
type Validado<T> = { valor: T } | { erro: string };

function validarNome(digitado: string): Validado<string> {
  const limpo = digitado.trim();
  if (limpo.length < NOME_MIN) return { erro: "Escreva o nome do serviço." };
  if (limpo.length > NOME_MAX)
    return { erro: `No máximo ${NOME_MAX} caracteres.` };
  return { valor: limpo };
}

// "20,00" e "20.00" viram a mesma string decimal. Number entra só na
// normalização, nunca no que é enviado: o preço é Decimal no banco.
function paraDecimal(digitado: string): Validado<string> {
  const limpo = digitado.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo))
    return { erro: "Use um valor como 40,00" };
  const [inteiro] = limpo.split(".");
  // Contado antes do `Number`: a partir de 1e21 o toFixed sai em
  // notação científica ("1e+21"), que não casa com PADRAO_PRECO e
  // chegaria na API como um 400 sobre o formato, não sobre o tamanho.
  if (inteiro.length > PRECO_INTEIRO_MAX)
    return { erro: `No máximo ${PRECO_INTEIRO_MAX} dígitos antes da vírgula.` };
  return { valor: Number(limpo).toFixed(2) };
}

// Mesma guarda do preço, pro campo ao lado: `duracaoMinutos` é inteiro
// na API, e um `Number(duracao)` direto deixa "" virar 0 e "abc" virar
// NaN — que o `JSON.stringify` do corpo transforma em `null`.
function paraMinutos(digitado: string): Validado<number> {
  const limpo = digitado.trim();
  if (!/^\d+$/.test(limpo))
    return { erro: "Use um número inteiro de minutos, como 30" };
  const numero = Number(limpo);
  if (numero < DURACAO_MIN || numero > DURACAO_MAX)
    return { erro: `Entre ${DURACAO_MIN} e ${DURACAO_MAX} minutos.` };
  if (numero % DURACAO_PASSO !== 0)
    return { erro: `Use múltiplos de ${DURACAO_PASSO} minutos — 30, 45, 60.` };
  return { valor: numero };
}

export function CadastroDeServico() {
  const { id } = useParams<{ id?: string }>();
  const router = useRouter();
  const api = useApiDoPainel();

  // Não existe servico(id) no client: cliente(id) e agendamento(id)
  // existem, este não. A lista basta, e devolve inclusive os inativos.
  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);
  const atual = id ? servicos.dados?.find((s) => s.id === id) : undefined;

  const [nome, setNome] = useState("");
  const [duracao, setDuracao] = useState("");
  const [preco, setPreco] = useState("");
  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroDuracao, setErroDuracao] = useState<string | undefined>();
  const [erroPreco, setErroPreco] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado durante a renderização, e não num `useEffect`: mesmo
  // mecanismo do fix em ConfiguracoesDaBarbearia (181514d) — um efeito
  // só roda depois do commit, e entre o commit e o efeito o formulário
  // já teria aparecido com os campos vazios, aberto a digitar contra o
  // preenchimento assíncrono. Setar estado durante a própria
  // renderização faz o React descartar essa renderização e refazer com
  // o valor certo antes de pintar qualquer coisa — não existe commit
  // intermediário pra observar ou editar.
  //
  // O `!==` contra o rastreador (`atualSincronizado`) é o que impede o
  // loop: sem ele, cada `setNome`/`setDuracao`/`setPreco` re-renderiza,
  // a condição continua verdadeira (nada mudou o valor de `atual`, mas
  // também nada faria a igualdade falhar de novo), e o componente
  // re-renderiza pra sempre. É tentador "simplificar" isto pra um
  // booleano tipo `jaSincronizei` — não faça: um booleano nunca reabre
  // depois do primeiro `true`, e quebra o re-sync depois de
  // `alternarAtivo()` (abaixo) chamar `servicos.recarregar()`.
  //
  // O rastreador aqui é `atual` (o item achado na lista), não
  // `servicos.dados` (a lista inteira): o dublê de teste devolve a
  // mesma referência de array em toda chamada a `servicos()` (só o item
  // dentro dela é substituído por `{...antigo, ...edicao}`), então
  // `servicos.dados !== anterior` nunca dispararia depois de
  // `servicos.recarregar()`. `atual`, por vir de `.find()` sobre esse
  // array, aponta pro objeto recém-substituído — muda de referência
  // sempre que o serviço é editado ou reativado, com ou sem essa
  // peculiaridade do dublê.
  const [atualSincronizado, setAtualSincronizado] = useState<typeof atual>(undefined);
  if (atual && atual !== atualSincronizado) {
    setAtualSincronizado(atual);
    setNome(atual.nome);
    setDuracao(String(atual.duracaoMinutos));
    setPreco(atual.preco);
  }

  // Sem isto, uma falha em servicos() deixava dados null pra sempre: o
  // guard de "não encontrado" também depende de dados, então nenhum dos
  // dois disparava e a tela ficava no formulário vazio sem dizer nada.
  if (servicos.erro) {
    return <Aviso>{servicos.erro.mensagem || "Não foi possível carregar os serviços agora."}</Aviso>;
  }

  if (id && servicos.dados && !atual) {
    return <Aviso>Serviço não encontrado.</Aviso>;
  }

  async function salvar() {
    setAviso(undefined);

    // Os três campos são validados SEMPRE, e não até o primeiro que
    // falha: parar no primeiro faz o formulário revelar um erro por
    // tentativa, e quem digitou nome curto e duração fora da grade
    // descobre a segunda só depois de consertar a primeira.
    const comNome = validarNome(nome);
    const comMinutos = paraMinutos(duracao);
    const comDecimal = paraDecimal(preco);

    setErroNome("erro" in comNome ? comNome.erro : undefined);
    setErroDuracao("erro" in comMinutos ? comMinutos.erro : undefined);
    setErroPreco("erro" in comDecimal ? comDecimal.erro : undefined);

    if ("erro" in comNome || "erro" in comMinutos || "erro" in comDecimal) {
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        nome: comNome.valor,
        duracaoMinutos: comMinutos.valor,
        preco: comDecimal.valor,
      };
      if (id) await api.barbeiro.atualizarServico(id, corpo);
      else await api.barbeiro.criarServico(corpo);
      router.push("/painel/servicos");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  async function alternarAtivo() {
    if (!id || !atual) return;
    setSalvando(true);
    try {
      // Soft delete: some da lista pública e o histórico de quem já foi
      // atendido sobrevive.
      if (atual.ativo) await api.barbeiro.desativarServico(id);
      else await api.barbeiro.atualizarServico(id, { ativo: true });
      servicos.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  return (
    <div className={estilos.pagina}>
      <h1>{id ? "Editar serviço" : "Novo serviço"}</h1>

      <Campo
        rotulo="Nome"
        placeholder="Corte"
        valor={nome}
        onChange={(proximo) => {
          setNome(proximo);
          setErroNome(undefined);
        }}
        erro={erroNome}
      />
      {/* `inputMode` e não `type="number"`: o teclado do celular abre
          numérico do mesmo jeito, e o campo continua uma string — que é
          o que o `paraMinutos`/`paraDecimal` validam. `type="number"`
          traria as setinhas, a roda do mouse mudando o valor sem querer
          e um `value` que o navegador esvazia sozinho quando a
          digitação é inválida. */}
      <Campo
        rotulo="Duração em minutos"
        inputMode="numeric"
        placeholder="30"
        valor={duracao}
        onChange={(proximo) => {
          setDuracao(proximo);
          setErroDuracao(undefined);
        }}
        erro={erroDuracao}
      />
      <Campo
        rotulo="Preço"
        inputMode="decimal"
        placeholder="40,00"
        valor={preco}
        onChange={(proximo) => {
          setPreco(proximo);
          setErroPreco(undefined);
        }}
        erro={erroPreco}
      />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {/* As duas saídas do formulário na mesma linha: sem o Cancelar, a
          única forma de desistir era a barra lateral, que leva pra
          outro lugar qualquer do painel em vez de voltar pra lista de
          onde a pessoa veio.

          `type="button"` porque esta tela ainda não tem <form>, e vai
          ter: no dia em que tiver, um <button> sem type é submit, e
          "Cancelar" salvaria o serviço. */}
      <div className={estilos.acoes}>
        <Botao type="button" carregando={salvando} onClick={salvar}>
          Salvar
        </Botao>
        {/* Sem `carregando`: desistir tem que funcionar inclusive
            enquanto o salvamento pendura. */}
        <Botao
          type="button"
          variante="contorno"
          onClick={() => router.push("/painel/servicos")}
        >
          Cancelar
        </Botao>
      </div>

      {/* Fora do grupo acima de propósito: desativar não é uma saída do
          formulário, é uma mudança de estado do serviço — e fica longe
          do Cancelar pra ninguém acertar uma querendo a outra. */}
      {atual ? (
        <div className={estilos.acaoDoEstado}>
          <Botao
            type="button"
            variante="contorno"
            carregando={salvando}
            onClick={alternarAtivo}
          >
            {atual.ativo ? "Desativar" : "Reativar"}
          </Botao>
        </div>
      ) : null}
    </div>
  );
}
