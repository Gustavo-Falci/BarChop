"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ErroDaApi } from "@barchop/api-client";
import {
  APARENCIA_PADRAO,
  CORES_DA_MARCA,
  FONTES_DO_TEXTO,
  FONTES_DOS_TITULOS,
  TEMAS,
  normalizarAparencia,
  paletaDaAparencia,
  personalizada,
  temaPorId,
  aplicarTema,
  NOVE_CORES,
  TOKEN_DA_COR,
  type Aparencia,
  type Botao as EstiloDoBotao,
  type Cantos,
  type Cards,
  type FonteDoTexto,
  type FonteDosTitulos,
  type IdDoTema,
  type LayoutDosServicos,
  type ModoDeCor,
  type NomeDaCor,
  type TamanhoDoTexto,
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
import { PreviaDaPagina } from "./PreviaDaPagina";
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

// A letra: o nome de cada família e a variável que o next/font declara
// no <html> (app/fontes.ts) — o "Aa" de cada botão sai na própria fonte.
const FONTES: Record<FonteDosTitulos, { nome: string; variavel: string }> = {
  clash: { nome: "Clash Grotesk", variavel: "--fonte-display" },
  inter: { nome: "Inter", variavel: "--fonte-inter" },
  roboto: { nome: "Roboto", variavel: "--fonte-roboto" },
  poppins: { nome: "Poppins", variavel: "--fonte-poppins" },
  montserrat: { nome: "Montserrat", variavel: "--fonte-montserrat" },
  "open-sans": { nome: "Open Sans", variavel: "--fonte-open-sans" },
  lato: { nome: "Lato", variavel: "--fonte-lato" },
};

const TAMANHOS: { valor: TamanhoDoTexto; rotulo: string; efeito: string }[] = [
  { valor: "compacto", rotulo: "Compacto", efeito: "Letra um pouco menor: cabe mais na tela do celular." },
  { valor: "normal", rotulo: "Normal", efeito: "O tamanho de sempre." },
  { valor: "espacoso", rotulo: "Espaçoso", efeito: "Letra um pouco maior: mais fácil de ler." },
];

const LAYOUTS: { valor: LayoutDosServicos; rotulo: string; efeito: string }[] = [
  {
    valor: "agrupada",
    rotulo: "Lista agrupada",
    efeito: "As categorias empilhadas: o cliente rola e vê todos os serviços de uma vez.",
  },
  {
    valor: "abas",
    rotulo: "Abas de categoria",
    efeito: "Uma categoria por vez: o cliente toca na aba pra ver os serviços dela.",
  },
];

// O ajuste fino: cada opção com a frase do efeito.
const CANTOS: { valor: Cantos; rotulo: string; efeito: string }[] = [
  { valor: "retos", rotulo: "Retos", efeito: "Botões, campos e cards com cantos quase retos." },
  { valor: "arredondados", rotulo: "Arredondados", efeito: "O arredondado de sempre." },
  { valor: "pilula", rotulo: "Pílula", efeito: "Botões em pílula e cards bem arredondados." },
];

const BOTOES: { valor: EstiloDoBotao; rotulo: string; efeito: string }[] = [
  { valor: "solido", rotulo: "Sólido", efeito: "O botão de agendar cheio, na cor da marca." },
  { valor: "contorno", rotulo: "Contorno", efeito: "Fundo claro, com a borda e o texto na cor da marca." },
  { valor: "gradiente", rotulo: "Gradiente", efeito: "Um degradê suave da cor da marca." },
];

const CARDS: { valor: Cards; rotulo: string; efeito: string }[] = [
  { valor: "plano", rotulo: "Planos", efeito: "Sem borda nem sombra: cada serviço se separa só pelo fundo." },
  { valor: "elevado", rotulo: "Elevados", efeito: "Borda e a sombra marcada da casa." },
  { valor: "borda", rotulo: "Com borda", efeito: "Só a borda, sem sombra." },
];

const NOME_DA_NOVE: Record<NomeDaCor, string> = {
  marca: "Marca",
  secundaria: "Secundária",
  destaque: "Destaque",
  fundo: "Fundo",
  card: "Card",
  apagado: "Apagado",
  texto: "Texto",
  textoDeApoio: "Texto de apoio",
  linhas: "Linhas",
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
  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [modoDasNove, setModoDasNove] = useState<Modo>("claro");

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

  // O layout dos serviços salva na hora, direto no ar (e no rascunho
  // pendente, se houver). Antes, as gravações do rascunho em curso
  // terminam: uma resposta atrasada traria o layout velho de volta.
  const [salvandoLayout, setSalvandoLayout] = useState(false);
  async function escolherLayout(layoutDosServicos: LayoutDosServicos) {
    if (layoutDosServicos === noAr.layoutDosServicos) return;
    setAviso(undefined);
    setSalvandoLayout(true);
    try {
      await terminarDeGravar();
      await api.barbeiro.salvarLayoutDosServicos(layoutDosServicos);
      setNoAr({ ...noAr, layoutDosServicos });
      setRascunho({ ...rascunho, layoutDosServicos });
      marcar("aparencia");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar o layout agora.");
    } finally {
      setSalvandoLayout(false);
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

  // Uma das nove: igual ao que sairia sem ela, não fica guardada.
  function escolherUmaDasNove(nome: NomeDaCor, cor: string) {
    const sem = comCor(rascunho, modoDasNove, nome, null);
    const daConta = paletaDaAparencia(sem)[modoDasNove][TOKEN_DA_COR[nome]];
    mudar(comCor(sem, modoDasNove, nome, cor === daConta ? null : cor));
  }

  return (
    <MolduraDaArea area="aparencia" decididas={decididas} aviso={aviso}>
      <div className={estilos.comPrevia}>
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

          <SecaoNumerada numero={4} titulo="A letra" apoio="A fonte de todo o texto da sua página.">
            <EscolhaDeFonte
              rotulo="A fonte do texto"
              opcoes={FONTES_DO_TEXTO}
              valor={rascunho.fonte}
              aoEscolher={(fonte) => mudar({ ...rascunho, fonte: fonte as FonteDoTexto })}
            />
          </SecaoNumerada>

          <SecaoNumerada
            numero={5}
            titulo="Ajuste fino"
            lado={
              <button
                type="button"
                className={estilos.abrir}
                aria-expanded={ajusteAberto}
                aria-controls="ajuste-fino"
                aria-label={ajusteAberto ? "Fechar o ajuste fino" : "Abrir o ajuste fino"}
                onClick={() => setAjusteAberto(!ajusteAberto)}
              >
                {ajusteAberto ? "Fechar" : "Abrir"}
              </button>
            }
            apoio="Cantos, botão, cards e as cores uma a uma. Quase ninguém precisa — o tema já resolve."
          >
            {ajusteAberto ? (
              <div id="ajuste-fino" className={estilos.ajuste}>
                <div className={estilos.tresColunas}>
                  <SeletorEmPilulas<"sim" | "nao">
                    nome="titulos-outra-fonte"
                    legenda="Os títulos usam outra fonte"
                    opcoes={[
                      { valor: "sim", rotulo: "Sim" },
                      { valor: "nao", rotulo: "Não" },
                    ]}
                    valor={rascunho.fonteDosTitulos === null ? "nao" : "sim"}
                    aoTrocar={(valor) =>
                      mudar({ ...rascunho, fonteDosTitulos: valor === "sim" ? (rascunho.fonteDosTitulos ?? "clash") : null })
                    }
                    efeito={
                      rascunho.fonteDosTitulos === null
                        ? "Títulos e texto na mesma fonte."
                        : `Os títulos em ${FONTES[rascunho.fonteDosTitulos].nome}, o texto em ${FONTES[rascunho.fonte].nome}.`
                    }
                  />
                  <SeletorEmPilulas<TamanhoDoTexto>
                    nome="tamanho-do-texto"
                    legenda="Tamanho do texto"
                    opcoes={TAMANHOS}
                    valor={rascunho.tamanhoDoTexto}
                    aoTrocar={(tamanhoDoTexto) => mudar({ ...rascunho, tamanhoDoTexto })}
                    efeito={TAMANHOS.find((item) => item.valor === rascunho.tamanhoDoTexto)!.efeito}
                  />
                </div>
                {rascunho.fonteDosTitulos !== null ? (
                  <EscolhaDeFonte
                    rotulo="A fonte dos títulos"
                    opcoes={FONTES_DOS_TITULOS}
                    valor={rascunho.fonteDosTitulos}
                    aoEscolher={(fonteDosTitulos) => mudar({ ...rascunho, fonteDosTitulos })}
                  />
                ) : null}
                <div className={estilos.tresColunas}>
                  <SeletorEmPilulas<Cantos>
                    nome="cantos"
                    legenda="Os cantos"
                    opcoes={CANTOS}
                    valor={rascunho.cantos}
                    aoTrocar={(cantos) => mudar({ ...rascunho, cantos })}
                    efeito={CANTOS.find((item) => item.valor === rascunho.cantos)!.efeito}
                  />
                  <SeletorEmPilulas<EstiloDoBotao>
                    nome="botao"
                    legenda="O botão principal"
                    opcoes={BOTOES}
                    valor={rascunho.botao}
                    aoTrocar={(botao) => mudar({ ...rascunho, botao })}
                    efeito={BOTOES.find((item) => item.valor === rascunho.botao)!.efeito}
                  />
                  <SeletorEmPilulas<Cards>
                    nome="cards"
                    legenda="Os cards"
                    opcoes={CARDS}
                    valor={rascunho.cards}
                    aoTrocar={(cards) => mudar({ ...rascunho, cards })}
                    efeito={CARDS.find((item) => item.valor === rascunho.cards)!.efeito}
                  />
                </div>

                <div className={estilos.fundo}>
                  <SeletorEmPilulas<Modo>
                    nome="nove-cores-modo"
                    legenda="As nove cores de qual modo"
                    opcoes={[
                      { valor: "claro", rotulo: "Modo claro" },
                      { valor: "escuro", rotulo: "Modo escuro" },
                    ]}
                    valor={modoDasNove}
                    aoTrocar={setModoDasNove}
                  />
                  <div className={estilos.nove}>
                    {NOVE_CORES.map((nome) => (
                      <CampoDeCor
                        key={nome}
                        rotulo={NOME_DA_NOVE[nome]}
                        valor={paleta[modoDasNove][TOKEN_DA_COR[nome]]}
                        aoAplicar={(cor) => escolherUmaDasNove(nome, cor)}
                      />
                    ))}
                  </div>
                  <p className={estilos.efeito}>
                    No escuro, a cor da marca acompanha a do claro e o resto vem do tema. Mexa só no que estiver errado.
                  </p>
                </div>
              </div>
            ) : null}
          </SecaoNumerada>

          <SecaoNumerada
            numero={6}
            titulo="Layout dos serviços"
            lado="Salva na hora"
            apoio="Como a lista de serviços aparece na página inicial."
          >
            <div className={estilos.layouts}>
              {LAYOUTS.map((layout) => (
                <button
                  key={layout.valor}
                  type="button"
                  className={estilos.layout}
                  aria-pressed={noAr.layoutDosServicos === layout.valor}
                  disabled={salvandoLayout}
                  onClick={() => escolherLayout(layout.valor)}
                >
                  <strong>{layout.rotulo}</strong>
                  <span className={estilos.efeito}>{layout.efeito}</span>
                </button>
              ))}
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
        {/* A prévia ao vivo (marco E): o rascunho na página de verdade. */}
        <aside className={estilos.lateral}>
          <PreviaDaPagina slug={dados.slug} aparencia={rascunho} pendente={pendente} />
        </aside>
      </div>
    </MolduraDaArea>
  );
}

// Uma família por botão, com o "Aa" desenhado nela.
function EscolhaDeFonte({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: readonly FonteDosTitulos[];
  valor: FonteDosTitulos;
  aoEscolher: (fonte: FonteDosTitulos) => void;
}) {
  return (
    <div className={estilos.fontes}>
      <span className={estilos.rotulo}>{rotulo}</span>
      <div role="group" aria-label={rotulo} className={estilos.fontesOpcoes}>
        {opcoes.map((fonte) => (
          <button
            key={fonte}
            type="button"
            className={estilos.fonte}
            aria-pressed={fonte === valor}
            aria-label={FONTES[fonte].nome}
            onClick={() => aoEscolher(fonte)}
          >
            <span className={estilos.fonteAa} style={{ fontFamily: `var(${FONTES[fonte].variavel})` }} aria-hidden="true">
              Aa
            </span>
            <span className={estilos.fonteNome} aria-hidden="true">
              {FONTES[fonte].nome}
            </span>
          </button>
        ))}
      </div>
    </div>
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
