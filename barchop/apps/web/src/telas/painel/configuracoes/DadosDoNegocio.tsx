"use client";

import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { COMODIDADES, FORMAS_DE_PAGAMENTO, PADRAO_SLUG, slugReservado } from "@barchop/formato";
import type { SolicitacaoDeLink } from "@barchop/types";
import { ROTULO_DA_COMODIDADE, ROTULO_DO_PAGAMENTO } from "../../../formato/pagina";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { Campo } from "../../../componentes/Campo";
import { CampoDeImagem } from "../../../componentes/CampoDeImagem";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { enderecoDaBarbearia } from "../../../tenant/endereco";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import estilos from "./Configuracoes.module.css";

const FORMATO_DO_SLUG = new RegExp(PADRAO_SLUG);

// O mesmo limite da coluna `sobre` e do schema do PATCH. Cortar na
// digitação evita o 400 que voltaria depois de a pessoa ter escrito o
// texto inteiro.
const SOBRE_MAX = 1000;

const ABAS = [
  { id: "identidade", rotulo: "Identidade" },
  { id: "marca", rotulo: "Marca" },
  { id: "comodidades", rotulo: "Comodidades" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

// Dados do negócio: como a barbearia se apresenta na página pública, em
// três abas — Identidade (nome, endereço, apresentação e o link), Marca
// (a capa) e Comodidades (comodidades e formas de pagamento). Cada aba
// salva o seu; o estado mora aqui em cima, então trocar de aba não
// perde o que foi digitado e ainda não salvo.
export function DadosDoNegocio() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") return <SoODono area="dados_do_negocio" />;
  return <Dados />;
}

function Dados() {
  const api = useApiDoPainel();
  const id = useId();
  // A aba pode vir na URL (?aba=marca) — é como o índice e a "próxima
  // área" podem apontar direto pra ela.
  const pedidaNaUrl = useSearchParams()?.get("aba");
  const [aba, setAba] = useState<Aba>(ABAS.some((item) => item.id === pedidaNaUrl) ? (pedidaNaUrl as Aba) : "identidade");

  // Pelo escopo do barbeiro, não pela rota pública por slug: o painel lê
  // o que ele mesmo escreve.
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const { decididas, marcar } = useAreasDecididas(barbearia.dados?.areasDecididas);

  const [nomeDaBarbearia, setNomeDaBarbearia] = useState("");
  const [endereco, setEndereco] = useState("");
  const [sobre, setSobre] = useState("");
  const [comodidades, setComodidades] = useState<string[]>([]);
  const [formasDePagamento, setFormasDePagamento] = useState<string[]>([]);
  // O pedido de troca do link (F4): o link é único pra sempre e só o
  // suporte troca.
  const [novoLink, setNovoLink] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<Record<string, string | undefined>>({});
  const [aviso, setAviso] = useState<string | undefined>();
  // Um só, e não um por aba: só uma aba está em edição por vez.
  const [salvando, setSalvando] = useState(false);

  // O pedido mais recente, de qualquer status. Depois de pedir ou
  // cancelar, a resposta da API entra por cima da leitura, sem reler —
  // reler apagaria o formulário por um instante.
  const pedidoLido = useRequisicao(() => api.barbeiro.solicitacaoDeLink(), []);
  const [pedidoNovo, setPedidoNovo] = useState<SolicitacaoDeLink | undefined>();
  const pedido = pedidoNovo ?? pedidoLido.dados;

  // Sincronizado durante a renderização, e não num `useEffect`: um
  // efeito só roda depois do commit, e entre o commit e o efeito o
  // formulário já teria aparecido com o campo vazio — digitar nessa
  // janela corre contra o preenchimento e perde o que a pessoa escreveu
  // (visto em teste sob carga: "GR BarberGR Barber Centro"; fix
  // 181514d). O React descarta esta renderização e refaz com o valor
  // certo antes de pintar. O `!==` contra o rastreador impede o loop.
  const [sincronizada, setSincronizada] = useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== sincronizada) {
    setSincronizada(barbearia.dados);
    setNomeDaBarbearia(barbearia.dados.nome);
    setEndereco(barbearia.dados.endereco ?? "");
    setSobre(barbearia.dados.sobre ?? "");
    setComodidades(barbearia.dados.comodidades);
    setFormasDePagamento(barbearia.dados.formasDePagamento);
  }

  async function salvarIdentidade() {
    setAviso(undefined);
    setErro({});
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMinhaBarbearia({
        nome: nomeDaBarbearia.trim(),
        endereco: endereco.trim() || null,
        // Vazio vira `null`, não string vazia: é `null` que a home lê
        // como "esta barbearia ainda não escreveu apresentação".
        sobre: sobre.trim() || null,
      });
      marcar("dados_do_negocio");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarComodidades() {
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMinhaBarbearia({
        // Na ordem da lista, não na dos cliques: a página mostra igual
        // pra todo mundo, seja qual for a ordem em que o dono marcou.
        comodidades: COMODIDADES.filter((c) => comodidades.includes(c)),
        formasDePagamento: FORMAS_DE_PAGAMENTO.filter((f) => formasDePagamento.includes(f)),
      });
      marcar("dados_do_negocio");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function pedirTroca() {
    setAviso(undefined);
    setErro({});

    // As regras da API, aqui pra o erro ficar no campo e em português.
    if (!FORMATO_DO_SLUG.test(novoLink)) {
      setErro({ novoLink: "Use letras minúsculas, números e hífen, de 3 a 80 caracteres" });
      return;
    }
    if (slugReservado(novoLink)) {
      setErro({ novoLink: "Esse link é reservado pelo BarChop. Escolha outro" });
      return;
    }
    if (novoLink === barbearia.dados?.slug) {
      setErro({ novoLink: "Esse já é o link da barbearia" });
      return;
    }

    setSalvando(true);
    try {
      setPedidoNovo(await api.barbeiro.pedirTrocaDeLink(novoLink, motivo.trim() || undefined));
      setNovoLink("");
      setMotivo("");
    } catch (causa) {
      const erroDaApi = causa as ErroDaApi;
      // O nome é de outra barbearia, atual ou antigo: o link é único pra
      // sempre.
      if (erroDaApi.codigo === "conflito") {
        setErro({ novoLink: "Esse link já está em uso por outra barbearia" });
        return;
      }
      // Pedido feito em outra aba: mostra o que está valendo.
      if (erroDaApi.codigo === "solicitacao_pendente") {
        setPedidoNovo(undefined);
        pedidoLido.recarregar();
        return;
      }
      setAviso(erroDaApi.mensagem || "Não foi possível pedir a troca agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelarPedido() {
    setAviso(undefined);
    setSalvando(true);
    try {
      setPedidoNovo(await api.barbeiro.cancelarPedidoDeLink());
    } catch (causa) {
      // 404: o suporte decidiu no meio. Relê pra mostrar a decisão.
      setPedidoNovo(undefined);
      pedidoLido.recarregar();
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível cancelar agora.");
    } finally {
      setSalvando(false);
    }
  }

  // A capa salva sozinha, na hora do envio — e enviar é decidir a Marca.
  async function enviarCapa(arquivo: Blob) {
    const url = await api.barbeiro.enviarCapa(arquivo);
    marcar("dados_do_negocio");
    return url;
  }

  if (barbearia.erro) {
    return <Aviso>{barbearia.erro.mensagem || "Não foi possível carregar a barbearia agora."}</Aviso>;
  }
  if (!barbearia.dados) return <p>Carregando…</p>;

  return (
    <MolduraDaArea area="dados_do_negocio" decididas={decididas} aviso={aviso}>
      <div role="tablist" aria-label="Dados do negócio" className={estilos.abas}>
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${id}-aba-${item.id}`}
            aria-controls={`${id}-painel`}
            aria-selected={aba === item.id}
            className={estilos.aba}
            onClick={() => setAba(item.id)}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-painel`} aria-labelledby={`${id}-aba-${aba}`} className={estilos.coluna}>
        {aba === "identidade" ? (
          <>
            <Secao
              titulo="Como o negócio se apresenta"
              descricao="O que o cliente vê no topo da página pública."
              acao={
                <Botao onClick={salvarIdentidade} carregando={salvando}>
                  Salvar dados
                </Botao>
              }
            >
              <Campo rotulo="Nome da barbearia" valor={nomeDaBarbearia} onChange={setNomeDaBarbearia} />
              <Campo rotulo="Endereço" valor={endereco} onChange={setEndereco} />
              {/* <textarea> à mão, e não o Campo: ele é um <input>, e este
                  texto tem parágrafos. */}
              <div className={estilos.campoLongo}>
                <label className={estilos.rotulo} htmlFor="sobre">
                  Sobre a barbearia
                </label>
                <span className={estilos.apoio} id="sobre-apoio">
                  Aparece na sua página pública, embaixo do nome. Conte o que a barbearia tem de diferente.
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
                {/* O limite é do banco: passar dele viraria 400 depois de
                    o texto inteiro escrito. */}
                <span className={estilos.contador}>
                  {sobre.length} de {SOBRE_MAX}
                </span>
              </div>
            </Secao>

            {/* Seção própria, sem o "Salvar dados": o link não se edita
                aqui. Ele é único pra sempre (F4) e só o suporte o troca. */}
            {/* Título diferente do rótulo do campo: a seção é região
                nomeada pelo título, e os dois com "Link da barbearia"
                deixariam o campo ambíguo pra quem procura pelo rótulo. */}
            <Secao titulo="Endereço da sua página" descricao="O endereço que seus clientes usam pra marcar horário.">

              <Campo
                rotulo="Link da barbearia"
                name="link"
                readOnly
                apoio="O link é fixo: muda só com um pedido ao suporte. O endereço antigo continua levando à sua barbearia."
                valor={enderecoDaBarbearia(barbearia.dados.slug, process.env.NEXT_PUBLIC_URL_DO_SITE)}
              />
              {pedidoLido.carregando && pedido === null ? null : pedido?.status === "pendente" ? (
                <div className={estilos.pedido}>
                  <p>
                    Pedido aguardando o suporte:{" "}
                    <strong>{enderecoDaBarbearia(pedido.slugPedido, process.env.NEXT_PUBLIC_URL_DO_SITE)}</strong>
                  </p>
                  {pedido.motivo ? <p className={estilos.apoio}>Motivo: {pedido.motivo}</p> : null}
                  <Botao variante="contorno" onClick={cancelarPedido} carregando={salvando}>
                    Cancelar pedido
                  </Botao>
                </div>
              ) : (
                <>
                  {pedido?.status === "recusada" ? (
                    <div className={estilos.pedido}>
                      <p>
                        Pedido recusado pelo suporte:{" "}
                        <strong>{enderecoDaBarbearia(pedido.slugPedido, process.env.NEXT_PUBLIC_URL_DO_SITE)}</strong>
                      </p>
                      {pedido.resposta ? <p className={estilos.apoio}>{pedido.resposta}</p> : null}
                    </div>
                  ) : null}
                  <Campo
                    rotulo="Novo link"
                    name="novo-link"
                    autoComplete="off"
                    apoio="Como vai aparecer no endereço. Exemplo: barbearia-do-centro"
                    valor={novoLink}
                    onChange={(valor) => setNovoLink(valor.toLowerCase())}
                    erro={erro.novoLink}
                    maxLength={80}
                  />
                  <Campo rotulo="Motivo (opcional)" name="motivo" valor={motivo} onChange={setMotivo} maxLength={500} />
                  <Botao variante="contorno" onClick={pedirTroca} carregando={salvando}>
                    Pedir troca
                  </Botao>
                </>
              )}
            </Secao>
          </>
        ) : null}

        {aba === "marca" ? (
          <Secao
            titulo="Como sua página abre"
            descricao="A capa é a faixa larga no topo da sua página pública. Salva assim que você escolhe a imagem."
          >
            <CampoDeImagem
              rotulo="Capa"
              alt="Capa da barbearia"
              urlAtual={barbearia.dados.capaUrl ?? null}
              enviar={enviarCapa}
              remover={api.barbeiro.removerCapa}
            />
          </Secao>
        ) : null}

        {aba === "comodidades" ? (
          <Secao
            titulo="Comodidades e pagamento"
            descricao="O que a barbearia oferece e como o cliente paga — aparece na página pública."
            acao={
              <Botao onClick={salvarComodidades} carregando={salvando}>
                Salvar comodidades
              </Botao>
            }
          >
            <fieldset className={estilos.marcas}>
              <legend className={estilos.rotulo}>Comodidades</legend>
              {COMODIDADES.map((comodidade) => (
                <label key={comodidade}>
                  <input
                    type="checkbox"
                    checked={comodidades.includes(comodidade)}
                    onChange={() => setComodidades((atual) => alternar(atual, comodidade))}
                  />
                  {ROTULO_DA_COMODIDADE[comodidade]}
                </label>
              ))}
            </fieldset>
            <fieldset className={estilos.marcas}>
              <legend className={estilos.rotulo}>Formas de pagamento</legend>
              {FORMAS_DE_PAGAMENTO.map((forma) => (
                <label key={forma}>
                  <input
                    type="checkbox"
                    checked={formasDePagamento.includes(forma)}
                    onChange={() => setFormasDePagamento((atual) => alternar(atual, forma))}
                  />
                  {ROTULO_DO_PAGAMENTO[forma]}
                </label>
              ))}
            </fieldset>
          </Secao>
        ) : null}
      </div>
    </MolduraDaArea>
  );
}
