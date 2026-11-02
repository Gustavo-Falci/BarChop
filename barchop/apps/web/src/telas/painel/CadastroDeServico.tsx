"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { ServicoSerializado } from "@barchop/types";
import { CATEGORIAS_DE_SERVICO, type CategoriaDeServico } from "@barchop/formato";
import { Aviso } from "../../componentes/Aviso";
import { BarraDeMudancas } from "../../componentes/BarraDeMudancas";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { CampoDeImagem } from "../../componentes/CampoDeImagem";
import { CartaoDeServico } from "../../componentes/CartaoDeServico";
import { Chip } from "../../componentes/Chip";
import { FolhaDeEscolha } from "../../componentes/FolhaDeEscolha";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { categoriaConhecida, ROTULO_DA_CATEGORIA } from "../../formato/pagina";
import { IconeSeta } from "../../painel/icones";
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

// A categoria é escolhida da lista (era texto livre, e um erro de
// digitação virou seção na página pública). "" é o rádio de "Sem
// categoria": o rádio precisa de um valor, e o corpo manda null.
const OPCOES_DE_CATEGORIA: { valor: CategoriaDeServico | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Sem categoria" },
  ...CATEGORIAS_DE_SERVICO.map((valor) => ({ valor, rotulo: ROTULO_DA_CATEGORIA[valor] })),
];

function rotuloDaCategoria(categoria: CategoriaDeServico | "") {
  return categoria ? ROTULO_DA_CATEGORIA[categoria] : "Sem categoria";
}

// Onde o serviço aparece na página pública: a mesma frase na linha da
// categoria e na folha que escolhe.
function efeitoDaCategoria(categoria: CategoriaDeServico | "") {
  return categoria
    ? `Na sua página, aparece em “${ROTULO_DA_CATEGORIA[categoria]}”.`
    : "Sem categoria, aparece no fim da sua página.";
}
// O mesmo teto da coluna `servico.descricao` e do schema da API. Cortar
// na digitação evita o 400 depois do texto escrito.
const DESCRICAO_MAX = 300;

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
  const [categoria, setCategoria] = useState<CategoriaDeServico | "">("");
  const [descricao, setDescricao] = useState("");
  const [escolhendoCategoria, setEscolhendoCategoria] = useState(false);
  // A foto que a prévia mostra depois de trocar ou remover aqui. Não se
  // recarrega a lista pra isso: a sincronização abaixo refaria os campos
  // e apagaria o que o dono digitou e ainda não salvou.
  const [fotoDaPrevia, setFotoDaPrevia] = useState<string | null | undefined>(undefined);
  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroDuracao, setErroDuracao] = useState<string | undefined>();
  const [erroPreco, setErroPreco] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [avisoDaSituacao, setAvisoDaSituacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);
  // Separado do `salvando`: desativar não é salvar o formulário, e o
  // Salvar da barra não pode girar por causa dele (nem o contrário).
  const [mexendo, setMexendo] = useState(false);

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
    preencherCom(atual);
  }

  function preencherCom(servico: ServicoSerializado) {
    setNome(servico.nome);
    setDuracao(String(servico.duracaoMinutos));
    // Com vírgula, como o dono digita e como a lista mostra ("50,00");
    // o paraDecimal aceita os dois.
    setPreco(servico.preco.replace(".", ","));
    // Fora da lista abre como "Sem categoria": nenhuma opção marcada e
    // o valor velho voltaria no salvar, que a API recusa.
    setCategoria(categoriaConhecida(servico.categoria) ?? "");
    setDescricao(servico.descricao ?? "");
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

  // Na edição, o que difere do gravado, pra barra de mudanças (redesenho
  // dos detalhes, PR 7). Duração e preço comparam o valor, e não o que
  // foi digitado: "40" por cima de "40,00" não é mudança.
  const mudancas: string[] = [];
  if (atual) {
    if (nome.trim() !== atual.nome) mudancas.push("Nome");
    const minutos = paraMinutos(duracao);
    if (!("valor" in minutos)) mudancas.push("Duração");
    else if (minutos.valor !== atual.duracaoMinutos) {
      mudancas.push(`Duração: ${atual.duracaoMinutos} min → ${minutos.valor} min`);
    }
    const decimal = paraDecimal(preco);
    if (!("valor" in decimal)) mudancas.push("Preço");
    else if (decimal.valor !== atual.preco) {
      mudancas.push(`Preço: ${formatarPreco(atual.preco)} → ${formatarPreco(decimal.valor)}`);
    }
    const gravada = categoriaConhecida(atual.categoria) ?? "";
    if (categoria !== gravada) {
      mudancas.push(`Categoria: ${rotuloDaCategoria(gravada)} → ${rotuloDaCategoria(categoria)}`);
    }
    if (descricao.trim() !== (atual.descricao ?? "")) mudancas.push("Descrição");
  }

  function descartar() {
    if (!atual) return;
    preencherCom(atual);
    setErroNome(undefined);
    setErroDuracao(undefined);
    setErroPreco(undefined);
    setAviso(undefined);
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
        // Na edição vai sempre: "Sem categoria" é tirar a categoria (null).
        // No cadastro, só se escolhida.
        ...(id || categoria ? { categoria: categoria || null } : {}),
        // Na edição vai sempre: apagar o campo é tirar a descrição (null).
        ...(id || descricao.trim() ? { descricao: descricao.trim() || null } : {}),
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
    setAvisoDaSituacao(undefined);
    setMexendo(true);
    try {
      // Soft delete: some da lista pública e o histórico de quem já foi
      // atendido sobrevive.
      if (atual.ativo) await api.barbeiro.desativarServico(id);
      else await api.barbeiro.atualizarServico(id, { ativo: true });
      servicos.recarregar();
    } catch (causa) {
      setAvisoDaSituacao((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setMexendo(false);
  }

  // O cartão da prévia com o que está digitado agora. Campo ainda vazio ou
  // inválido entra com um valor de exemplo, pra o cartão não abrir torto
  // ("0 min", nome em branco) antes do dono começar.
  const precoDaPrevia = paraDecimal(preco);
  const minutosDaPrevia = paraMinutos(duracao);
  const servicoDaPrevia: ServicoSerializado = {
    id: atual?.id ?? "previa",
    nome: nome.trim() || "Seu serviço",
    duracaoMinutos: "valor" in minutosDaPrevia ? minutosDaPrevia.valor : 30,
    preco: "valor" in precoDaPrevia ? precoDaPrevia.valor : "0.00",
    ativo: true,
    categoria: null,
    descricao: descricao.trim() || null,
    fotoUrl: fotoDaPrevia !== undefined ? fotoDaPrevia : (atual?.fotoUrl ?? null),
  };

  // O resumo do que está gravado, embaixo do nome (como no membro):
  // muda só depois de salvar, e não a cada tecla.
  const categoriaGravada = atual ? categoriaConhecida(atual.categoria) : undefined;
  const resumo = atual
    ? [
        categoriaGravada ? ROTULO_DA_CATEGORIA[categoriaGravada] : null,
        `${atual.duracaoMinutos} min`,
        formatarPreco(atual.preco),
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <div className={estilos.pagina}>
      {/* O caminho de volta e o nome do serviço no topo (redesenho dos
          detalhes, PR 7; era "Editar serviço", sem volta). Enquanto a
          lista não chega, "Serviço": o formulário já está montado (ver a
          sincronização acima), e "Novo serviço" numa edição enganaria. */}
      <CabecalhoDaPagina
        voltar={{ href: "/painel/servicos", rotulo: "Serviços" }}
        titulo={atual ? atual.nome : id ? "Serviço" : "Novo serviço"}
        selo={
          atual && !atual.ativo ? (
            <Chip tom="neutro" tamanho="pequeno">
              Inativo
            </Chip>
          ) : undefined
        }
        apoio={resumo}
      />

      <div className={estilos.corpo}>
        <div className={estilos.principal}>
          <div className={`${estilos.cartao} ${estilos.recheio}`}>
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
            <div className={estilos.dupla}>
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
            </div>
          </div>

          {/* A categoria numa linha que abre a folha (decisão 4 do canvas):
              as sete pílulas quebravam em três linhas. */}
          <div className={estilos.cartao}>
            <button
              type="button"
              className={estilos.linha}
              aria-haspopup="dialog"
              onClick={() => setEscolhendoCategoria(true)}
            >
              <span className={estilos.texto}>
                <span className={estilos.nome}>Categoria (opcional)</span>
                <span className={estilos.efeitoDaLinha}>{efeitoDaCategoria(categoria)}</span>
              </span>
              <span className={estilos.valor}>{rotuloDaCategoria(categoria)}</span>
              <IconeSeta className={estilos.seta} width={18} height={18} aria-hidden="true" />
            </button>
          </div>

          {/* <textarea> à mão, e não o Campo (que é um <input>): mesmo
              desenho do "Sobre a barbearia" em ConfiguracoesDaBarbearia. */}
          <div className={estilos.campoLongo}>
            <label className={estilos.rotulo} htmlFor="descricao">
              Descrição (opcional)
            </label>
            <span className={estilos.apoio} id="descricao-apoio">
              Aparece no cartão do serviço, na hora de agendar. Exemplo: máquina e
              tesoura, acabamento na navalha.
            </span>
            <textarea
              id="descricao"
              className={estilos.area}
              aria-describedby="descricao-apoio"
              rows={3}
              maxLength={DESCRICAO_MAX}
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
            />
            <span className={estilos.contador}>
              {descricao.length} de {DESCRICAO_MAX}
            </span>
          </div>

          {/* O criar tem um botão só, sem Cancelar (decisão 2): volta pelo
              "← Serviços". */}
          {!id ? (
            <>
              {aviso ? <Aviso>{aviso}</Aviso> : null}
              <div className={estilos.acoes}>
                <Botao type="button" carregando={salvando} onClick={salvar}>
                  Cadastrar
                </Botao>
              </div>
            </>
          ) : null}
        </div>

        <div className={estilos.lateral}>
          {/* O cartão como o cliente vê na hora de agendar e, embaixo, a
              foto dele. Sem região nomeada: o rótulo "Foto" é do campo. */}
          <div className={estilos.secao}>
            <h2 className={estilos.titulo}>Como o cliente vê</h2>
            <div className={estilos.cartao}>
              {/* Decorativa: o formulário ao lado já diz tudo pra quem usa
                  leitor de tela, e o checkbox do cartão não faz nada aqui
                  (`inert` tira do teclado e do clique). */}
              <ul className={estilos.previa} aria-hidden="true" inert>
                <CartaoDeServico
                  servico={servicoDaPrevia}
                  marcado={false}
                  aoAlternar={() => {}}
                  proximos={[]}
                  agora={new Date()}
                />
              </ul>
              {/* Só na edição: a foto precisa de um serviço que já exista,
                  como a do membro. Salva sozinha, sem passar pela barra. */}
              <div className={estilos.foto}>
                {atual ? (
                  <CampoDeImagem
                    rotulo="Foto"
                    rotuloOculto
                    alt={`Foto de ${atual.nome}`}
                    urlAtual={atual.fotoUrl}
                    formato="quadrado"
                    enviar={async (arquivo) => {
                      const url = await api.barbeiro.enviarFotoDoServico(atual.id, arquivo);
                      setFotoDaPrevia(url);
                      return url;
                    }}
                    remover={async () => {
                      await api.barbeiro.removerFotoDoServico(atual.id);
                      setFotoDaPrevia(null);
                    }}
                  />
                ) : (
                  <p className={estilos.apoio}>Depois de salvar, dá pra pôr a foto.</p>
                )}
              </div>
            </div>
          </div>

          {/* Por último e longe do Salvar: mudar o estado do serviço não é
              editar os dados. A frase diz o efeito antes do botão. */}
          {atual ? (
            <section className={estilos.secao} aria-labelledby="servico-situacao">
              <h2 id="servico-situacao" className={estilos.titulo}>
                Situação
              </h2>
              <div className={`${estilos.cartao} ${estilos.recheio}`}>
                <p className={estilos.efeito}>
                  {atual.ativo
                    ? "Sai da sua página e do agendamento. Dá pra reativar depois."
                    : "Fora do agendamento. Reativar volta o serviço pra sua página."}
                </p>
                {avisoDaSituacao ? <Aviso>{avisoDaSituacao}</Aviso> : null}
                <div className={estilos.acaoDoEstado} data-perigo={atual.ativo || undefined}>
                  <Botao type="button" variante="contorno" carregando={mexendo} onClick={alternarAtivo}>
                    {atual.ativo ? "Desativar" : "Reativar"}
                  </Botao>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {escolhendoCategoria ? (
        <FolhaDeEscolha
          titulo="Categoria"
          nome="categoria"
          opcoes={OPCOES_DE_CATEGORIA}
          valor={categoria}
          efeito={efeitoDaCategoria}
          aoUsar={setCategoria}
          aoFechar={() => setEscolhendoCategoria(false)}
        />
      ) : null}

      {/* Na edição, um Salvar só, na barra do pé (decisão 2), filha
          direta da página pra ficar presa no pé. */}
      {atual ? (
        <BarraDeMudancas
          mudancas={mudancas}
          aviso={aviso}
          salvando={salvando}
          aoSalvar={() => void salvar()}
          aoDescartar={descartar}
        />
      ) : null}
    </div>
  );
}
