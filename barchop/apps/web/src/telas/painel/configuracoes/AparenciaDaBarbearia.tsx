"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ErroDaApi } from "@barchop/api-client";
import {
  APARENCIA_PADRAO,
  CORES_DA_MARCA,
  TEMAS,
  normalizarAparencia,
  paletaDaAparencia,
  personalizada,
  temaPorId,
  aplicarTema,
  type Aparencia,
  type IdDoTema,
  type ModoDeCor,
  type NomeDaCor,
} from "@barchop/formato";
import { Botao } from "../../../componentes/Botao";
import { Chip } from "../../../componentes/Chip";
import { SecaoNumerada } from "../../../componentes/SecaoNumerada";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import { useRequisicao } from "../../../api/useRequisicao";
import { Aviso } from "../../../componentes/Aviso";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import estilos from "./Aparencia.module.css";

// Logo e capa moram em Dados do negócio › Marca e entram no ar na hora;
// aqui só se diz o que falta e se leva pra lá.
const MARCA = "/painel/configuracoes/dados-do-negocio?aba=marca";

type Modo = "claro" | "escuro";
type Filtro = "todos" | "claros" | "escuros";

// O nome de cada bolinha, pro leitor de tela e pro title. Diferentes dos
// nomes dos temas: "Oceano" já é um tema.
const NOME_DA_COR: Record<(typeof CORES_DA_MARCA)[number], string> = {
  "#FFD900": "Amarelo BarChop",
  "#2563EB": "Azul",
  "#475569": "Cinza-azulado",
  "#0369A1": "Azul-petróleo",
  "#0F766E": "Verde-água",
  "#15803D": "Verde",
  "#EAB308": "Mostarda",
  "#C2410C": "Laranja",
  "#9A3412": "Terracota",
  "#DC2626": "Vermelho",
  "#881337": "Vinho",
  "#DB2777": "Rosa",
  "#8B6B5A": "Areia",
  "#4F46E5": "Índigo",
  "#7C3AED": "Violeta",
  "#1C1C1C": "Carvão",
};

const EFEITO_DO_MODO: Record<ModoDeCor, string> = {
  claro: "Sua página abre no claro pra todo mundo.",
  escuro: "Sua página abre no escuro pra todo mundo.",
  automatico: "Sua página acompanha o celular ou o computador de cada cliente.",
};

// A paleta de cada tema puro, pras amostras: calculada uma vez.
const PALETAS_DOS_TEMAS = Object.fromEntries(
  TEMAS.map((tema) => [tema.id, paletaDaAparencia({ ...APARENCIA_PADRAO, tema: tema.id })])
) as Record<IdDoTema, ReturnType<typeof paletaDaAparencia>>;

// Duas aparências iguais: normalizadas, as chaves saem na mesma ordem.
function iguais(a: Aparencia, b: Aparencia): boolean {
  return JSON.stringify(normalizarAparencia(a)) === JSON.stringify(normalizarAparencia(b));
}

// Troca (ou tira, com null) uma das nove cores num modo.
function comCor(aparencia: Aparencia, modo: Modo, nome: NomeDaCor, cor: string | null): Aparencia {
  const doModo = { ...aparencia.cores[modo] };
  if (cor) doModo[nome] = cor;
  else delete doModo[nome];
  return { ...aparencia, cores: { ...aparencia.cores, [modo]: doModo } };
}

// /painel/configuracoes/aparencia. Só o dono.
export function AparenciaDaBarbearia() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") return <SoODono area="aparencia" />;
  return <TelaDaAparencia />;
}

function TelaDaAparencia() {
  const api = useApiDoPainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const { decididas, marcar } = useAreasDecididas(barbearia.dados?.areasDecididas);
  const [noAr, setNoAr] = useState<Aparencia>(APARENCIA_PADRAO);
  const [rascunho, setRascunho] = useState<Aparencia>(APARENCIA_PADRAO);
  const [aviso, setAviso] = useState<string | undefined>();
  const [publicando, setPublicando] = useState(false);
  // A última gravação do rascunho falhou: a tela tem uma mudança que o
  // servidor não tem, e publicar levaria pro ar a versão velha.
  const [naoGuardado, setNaoGuardado] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [modoDoFundo, setModoDoFundo] = useState<Modo>("claro");

  // Sincronizado na renderização, como nas outras áreas (ver
  // DadosDoNegocio). O rascunho guardado, se houver, é o que a tela abre.
  const [sincronizada, setSincronizada] = useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== sincronizada) {
    setSincronizada(barbearia.dados);
    const publicada = normalizarAparencia(barbearia.dados.aparencia);
    setNoAr(publicada);
    setRascunho(
      barbearia.dados.aparenciaRascunho ? normalizarAparencia(barbearia.dados.aparenciaRascunho) : publicada
    );
  }

  // Cada mudança vira rascunho no servidor, uma gravação por vez: o que
  // chega durante uma gravação espera, e só a última vai. Arrastar o
  // seletor de cor não vira uma fila de pedidos.
  const proxima = useRef<Aparencia | null>(null);
  const emCurso = useRef<Promise<void> | null>(null);

  async function esvaziar() {
    while (proxima.current) {
      const vez = proxima.current;
      proxima.current = null;
      try {
        await api.barbeiro.salvarRascunhoDaAparencia(vez);
        if (!proxima.current) setNaoGuardado(false);
      } catch (causa) {
        setNaoGuardado(true);
        setAviso((causa as ErroDaApi).mensagem || "Não foi possível guardar a mudança agora.");
      }
    }
    emCurso.current = null;
  }

  async function terminarDeGravar() {
    while (emCurso.current) await emCurso.current;
  }

  function mudar(nova: Aparencia) {
    setAviso(undefined);
    setRascunho(nova);
    proxima.current = nova;
    if (!emCurso.current) emCurso.current = esvaziar();
  }

  async function publicar() {
    setPublicando(true);
    try {
      await terminarDeGravar();
      const depois = await api.barbeiro.publicarAparencia();
      const publicada = normalizarAparencia(depois.aparencia);
      setNoAr(publicada);
      setRascunho(publicada);
      marcar("aparencia");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível publicar agora.");
    } finally {
      setPublicando(false);
    }
  }

  async function descartar() {
    proxima.current = null;
    await terminarDeGravar();
    try {
      await api.barbeiro.descartarRascunhoDaAparencia();
      setRascunho(noAr);
      setNaoGuardado(false);
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível descartar agora.");
    }
  }

  if (barbearia.erro) {
    return <Aviso>{barbearia.erro.mensagem || "Não foi possível carregar a barbearia agora."}</Aviso>;
  }
  if (!barbearia.dados) return <p>Carregando…</p>;

  const dados = barbearia.dados;
  const pendente = !iguais(rascunho, noAr);
  const tema = temaPorId(rascunho.tema);
  const paleta = paletaDaAparencia(rascunho);
  // O tema sem as cores trocadas: é com ele que se sabe se uma cor
  // escolhida é a do tema (e não personaliza nada).
  const puro = PALETAS_DOS_TEMAS[rascunho.tema];
  const temasVisiveis = TEMAS.filter((item) =>
    filtro === "todos" ? true : filtro === "escuros" ? item.abreNoEscuro : !item.abreNoEscuro
  );

  function escolherMarca(cor: string) {
    // A marca é uma só: definida no claro, o escuro acompanha.
    const semEscuro = comCor(rascunho, "escuro", "marca", null);
    mudar(comCor(semEscuro, "claro", "marca", cor === puro.claro.accent ? null : cor));
  }

  function escolherFundo(cor: string) {
    mudar(comCor(rascunho, modoDoFundo, "fundo", cor === puro[modoDoFundo].paper ? null : cor));
  }

  return (
    <MolduraDaArea area="aparencia" decididas={decididas} aviso={aviso}>
      <div className={estilos.tela}>
        <SecaoNumerada
          numero={1}
          titulo="A cara da sua loja"
          lado="Salva na hora"
          apoio="Logo e capa ficam em Dados do negócio › Marca e entram no ar assim que você envia."
        >
          <ul className={estilos.imagens}>
            <LinhaDaImagem
              titulo="Logo"
              detalhe="Quadrada · até 2 MB"
              url={dados.logoUrl}
              acao={dados.logoUrl ? "Trocar logo" : "Enviar logo"}
            />
            <LinhaDaImagem
              titulo="Capa"
              detalhe="Deitada, 4 por 1 — é a primeira coisa que o cliente vê"
              url={dados.capaUrl}
              acao={dados.capaUrl ? "Trocar capa" : "Enviar capa"}
            />
          </ul>
          {!dados.logoUrl && !dados.capaUrl ? (
            <p className={estilos.efeito}>
              Sem logo e capa, sua página abre só com as iniciais do nome sobre um fundo escuro.
            </p>
          ) : null}
        </SecaoNumerada>

        <SecaoNumerada
          numero={2}
          titulo="O tema da página"
          apoio="Cada tema traz a versão clara e a escura de uma vez. O selo marca os que abrem no escuro."
        >
          <SeletorEmPilulas<Filtro>
            nome="filtro-dos-temas"
            legenda="Mostrar temas"
            opcoes={[
              { valor: "todos", rotulo: "Todos" },
              { valor: "claros", rotulo: "Claros" },
              { valor: "escuros", rotulo: "Escuros" },
            ]}
            valor={filtro}
            aoTrocar={setFiltro}
          />

          {personalizada(rascunho) ? (
            <div className={estilos.personalizado}>
              <span>{tema.nome} · personalizado</span>
              <Botao
                variante="fantasma"
                onClick={() => mudar({ ...rascunho, cores: { claro: {}, escuro: {} } })}
              >
                Voltar ao original
              </Botao>
            </div>
          ) : null}

          <div className={estilos.temas}>
            {temasVisiveis.map((item) => (
              <CartaoDoTema
                key={item.id}
                id={item.id}
                ativo={item.id === rascunho.tema}
                aoEscolher={() => mudar(aplicarTema(rascunho, item.id))}
              />
            ))}
          </div>

          <div className={estilos.duasColunas}>
            <SeletorEmPilulas<ModoDeCor>
              nome="modo-padrao"
              legenda="Modo padrão"
              opcoes={[
                { valor: "claro", rotulo: "Claro" },
                { valor: "escuro", rotulo: "Escuro" },
                { valor: "automatico", rotulo: "Automático" },
              ]}
              valor={rascunho.modoPadrao}
              aoTrocar={(modoPadrao) => mudar({ ...rascunho, modoPadrao })}
              efeito={EFEITO_DO_MODO[rascunho.modoPadrao]}
            />
            <SeletorEmPilulas<"sim" | "nao">
              nome="cliente-troca-modo"
              legenda="Deixar o cliente trocar entre claro e escuro"
              opcoes={[
                { valor: "sim", rotulo: "Sim" },
                { valor: "nao", rotulo: "Não" },
              ]}
              valor={rascunho.clienteTrocaModo ? "sim" : "nao"}
              aoTrocar={(valor) => mudar({ ...rascunho, clienteTrocaModo: valor === "sim" })}
              efeito={
                rascunho.clienteTrocaModo
                  ? "Aparece o botão de lua e sol na sua página; a escolha fica guardada no aparelho do cliente."
                  : "Sua página fica sempre no modo padrão, sem o botão de lua e sol."
              }
            />
          </div>
        </SecaoNumerada>

        <SecaoNumerada
          numero={3}
          titulo="A cor da marca"
          apoio="É ela que pinta o botão de agendar e os destaques da sua página. O texto em cima dela se ajusta sozinho pra ser lido."
        >
          <div role="group" aria-label="Cor da marca" className={estilos.bolinhas}>
            {CORES_DA_MARCA.map((cor) => (
              <button
                key={cor}
                type="button"
                className={estilos.bolinha}
                style={{ background: cor }}
                aria-label={NOME_DA_COR[cor]}
                title={NOME_DA_COR[cor]}
                aria-pressed={paleta.claro.accent === cor}
                onClick={() => escolherMarca(cor)}
              />
            ))}
          </div>
          <CampoDeCor
            key="marca"
            rotulo="Outra cor"
            valor={paleta.claro.accent}
            aoAplicar={escolherMarca}
          />
          <p className={estilos.efeito}>
            Trocar a cor deixa o tema <strong>personalizado</strong>: ele para de acompanhar o tema original. “Voltar ao
            original” desfaz.
          </p>

          <div className={estilos.fundo}>
            <SeletorEmPilulas<Modo>
              nome="fundo-de-qual-modo"
              legenda="Fundo de qual modo"
              opcoes={[
                { valor: "claro", rotulo: "Modo claro" },
                { valor: "escuro", rotulo: "Modo escuro" },
              ]}
              valor={modoDoFundo}
              aoTrocar={setModoDoFundo}
            />
            <CampoDeCor
              key="fundo"
              rotulo="Cor de fundo"
              valor={paleta[modoDoFundo].paper}
              aoAplicar={escolherFundo}
            />
            <p className={estilos.efeito}>
              A cor atrás de tudo. Cartões, bordas e textos acompanham o fundo sozinhos, sempre com contraste pra leitura.
            </p>
          </div>
        </SecaoNumerada>

        {pendente ? (
          <div className={estilos.barra} aria-live="polite">
            <p className={estilos.barraTexto}>
              {naoGuardado ? (
                <>
                  <strong>Não guardado</strong> · a última mudança não chegou ao servidor.
                </>
              ) : (
                <>
                  <strong>Rascunho guardado</strong> · sua página ainda mostra a versão publicada.
                </>
              )}
            </p>
            <div className={estilos.barraAcoes}>
              {naoGuardado ? (
                <Botao variante="fantasma" onClick={() => mudar(rascunho)}>
                  Tentar de novo
                </Botao>
              ) : null}
              <Botao variante="fantasma" onClick={descartar} disabled={publicando}>
                Descartar
              </Botao>
              <Botao onClick={publicar} carregando={publicando} disabled={naoGuardado}>
                Publicar
              </Botao>
            </div>
          </div>
        ) : (
          <p className={estilos.noAr} aria-live="polite">
            <strong>No ar</strong> · sua página está com o que você vê aqui.
          </p>
        )}
      </div>
    </MolduraDaArea>
  );
}

function LinhaDaImagem({
  titulo,
  detalhe,
  url,
  acao,
}: {
  titulo: string;
  detalhe: string;
  url: string | null;
  acao: string;
}) {
  return (
    <li className={estilos.imagem}>
      {url ? (
        <img src={url} alt="" className={estilos.miniatura} />
      ) : (
        <span className={`${estilos.miniatura} ${estilos.semImagem}`} aria-hidden="true" />
      )}
      <span className={estilos.imagemTexto}>
        <strong>
          {titulo} {url ? null : <Chip tom="atencao" tamanho="pequeno">falta</Chip>}
        </strong>
        <span className={estilos.efeito}>{detalhe}</span>
      </span>
      <Link href={MARCA} className={estilos.imagemAcao}>
        {acao}
      </Link>
    </li>
  );
}

// Um tema como o cliente o veria: a metade clara e a escura lado a lado,
// com um cartão e o botão da marca.
function CartaoDoTema({ id, ativo, aoEscolher }: { id: IdDoTema; ativo: boolean; aoEscolher: () => void }) {
  const tema = temaPorId(id);
  const { claro, escuro } = PALETAS_DOS_TEMAS[id];
  return (
    <button type="button" className={estilos.tema} aria-pressed={ativo} aria-label={tema.nome} onClick={aoEscolher}>
      <span className={estilos.amostra} aria-hidden="true">
        {[claro, escuro].map((cores, indice) => (
          <span key={indice} className={estilos.metade} style={{ background: cores.paper }}>
            <span className={estilos.miniCartao} style={{ background: cores.surface, borderColor: cores.line }}>
              <span style={{ background: cores.ink }} />
              <span style={{ background: cores.muted }} />
            </span>
            <span className={estilos.aa} style={{ background: cores.accent, color: cores.onAccent }}>
              Aa
            </span>
          </span>
        ))}
      </span>
      <span className={estilos.temaNome}>
        {tema.nome}
        {tema.abreNoEscuro ? <span className={estilos.selo}>Escuro</span> : null}
      </span>
      <span className={estilos.temaDescricao}>{tema.descricao}</span>
      {ativo ? (
        <span className={estilos.marcado} aria-hidden="true">
          ✓
        </span>
      ) : null}
    </button>
  );
}

const PADRAO_HEX = /^#?([0-9A-F]{6})$/i;

// O seletor de cor do navegador e o hex escrito, juntos. O escrito vale
// no Enter ou ao sair do campo; fora do formato, diz como é.
function CampoDeCor({
  rotulo,
  valor,
  aoAplicar,
}: {
  rotulo: string;
  valor: string;
  aoAplicar: (cor: string) => void;
}) {
  const [texto, setTexto] = useState(valor);
  const [erro, setErro] = useState(false);
  // O valor muda por fora (uma bolinha, o seletor arrastado, outro modo):
  // o texto acompanha. Sincronizado na renderização e não por `key` — um
  // `key` com o valor remontaria o <input type="color"> a cada passo do
  // arrasto, e o navegador fecha o seletor aberto.
  const [base, setBase] = useState(valor);
  if (valor !== base) {
    setBase(valor);
    setTexto(valor);
    setErro(false);
  }
  const idDoErro = `${rotulo.replace(/\s+/g, "-").toLowerCase()}-erro`;

  function aplicar() {
    const casou = PADRAO_HEX.exec(texto.trim());
    if (!casou) {
      setErro(true);
      return;
    }
    setErro(false);
    const cor = `#${casou[1]!.toUpperCase()}`;
    if (cor !== valor) aoAplicar(cor);
  }

  return (
    <div className={estilos.campoDeCor}>
      <span className={estilos.rotulo}>{rotulo}</span>
      <input
        type="color"
        className={estilos.seletorDeCor}
        aria-label={`Escolher ${rotulo.toLowerCase()}`}
        value={valor.toLowerCase()}
        onChange={(evento) => aoAplicar(evento.target.value.toUpperCase())}
      />
      <input
        type="text"
        className={estilos.hex}
        aria-label={rotulo}
        aria-invalid={erro || undefined}
        aria-describedby={erro ? idDoErro : undefined}
        value={texto}
        spellCheck={false}
        maxLength={7}
        onChange={(evento) => setTexto(evento.target.value)}
        onBlur={aplicar}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            evento.preventDefault();
            aplicar();
          }
        }}
      />
      {erro ? (
        <span id={idDoErro} className={estilos.erro}>
          Use o formato #RRGGBB, como #2563EB.
        </span>
      ) : null}
    </div>
  );
}
