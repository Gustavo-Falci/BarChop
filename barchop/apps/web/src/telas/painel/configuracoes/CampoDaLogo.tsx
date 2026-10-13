"use client";

import { useId, useState } from "react";
import { ErroDaApi } from "@barchop/api-client";
import type { FormatoDaLogo } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { LogoDaBarbearia } from "../../../componentes/LogoDaBarbearia";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import estilosDoBotao from "../../../componentes/Botao.module.css";
import { prepararLogo } from "../../../painel/logo";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import estilos from "./CampoDaLogo.module.css";

const OPCOES: { valor: FormatoDaLogo; rotulo: string }[] = [
  { valor: "redonda", rotulo: "Redonda" },
  { valor: "quadrada", rotulo: "Quadrada" },
  { valor: "livre", rotulo: "Sem moldura" },
];

const ROTULO_DA_SUGESTAO: Record<FormatoDaLogo, string> = {
  redonda: "a moldura redonda",
  quadrada: "a moldura quadrada",
  livre: "deixar sem moldura",
};

export type MarcaDaBarbearia = { logoUrl: string; logoFormato: FormatoDaLogo } | null;

// A logo da barbearia, na aba Marca: escolher o arquivo sugere a moldura
// pelos pixels dele (painel/logo.ts) e já envia com ela; a prévia mostra
// a logo exatamente como a página e o painel vão mostrar, e as pílulas
// trocam só a moldura, sem reenviar a imagem. Como a capa, salva na hora.
//
// `aoMudar` avisa quem mostra a logo fora daqui — a marca da barra do
// painel — pra ela trocar sem recarregar a página.
export function CampoDaLogo({
  nome,
  inicial,
  aoMudar,
}: {
  nome: string;
  inicial: MarcaDaBarbearia;
  aoMudar?: (marca: MarcaDaBarbearia) => void;
}) {
  const api = useApiDoPainel();
  const id = useId();
  const [marca, setMarca] = useState<MarcaDaBarbearia>(inicial);
  const [sugerido, setSugerido] = useState<FormatoDaLogo | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState(false);

  // A leitura do servidor chega depois do primeiro render. Comparada pelo
  // conteúdo, e não pela referência: quem monta este campo cria o objeto
  // a cada render, e comparar referência desfaria a troca de moldura que
  // acabou de acontecer aqui.
  const chaveDoInicial = inicial ? `${inicial.logoUrl}|${inicial.logoFormato}` : "";
  const [sincronizada, setSincronizada] = useState(chaveDoInicial);
  if (chaveDoInicial !== sincronizada) {
    setSincronizada(chaveDoInicial);
    setMarca(inicial);
  }

  function mudar(proxima: MarcaDaBarbearia) {
    setMarca(proxima);
    aoMudar?.(proxima);
  }

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setAviso(undefined);
    setOcupado(true);
    try {
      const preparada = await prepararLogo(arquivo);
      const enviada = await api.barbeiro.enviarLogo(preparada.arquivo, preparada.formato);
      setSugerido(preparada.formato);
      mudar(enviada);
    } catch (causa) {
      const codigo = causa instanceof ErroDaApi ? causa.codigo : "";
      setAviso(
        codigo === "arquivo_grande_demais"
          ? "Imagem grande demais. Tente um arquivo menor."
          : codigo === "tipo_de_imagem_invalido"
            ? "Use uma imagem em PNG, JPG ou WebP."
            : "Não foi possível enviar a logo agora."
      );
    } finally {
      setOcupado(false);
    }
  }

  async function trocarFormato(formato: FormatoDaLogo) {
    if (!marca || formato === marca.logoFormato) return;
    const antes = marca;
    setAviso(undefined);
    mudar({ ...marca, logoFormato: formato });
    try {
      await api.barbeiro.atualizarMinhaBarbearia({ logoFormato: formato });
    } catch {
      mudar(antes);
      setAviso("Não foi possível trocar a moldura agora.");
    }
  }

  async function remover() {
    setAviso(undefined);
    setOcupado(true);
    try {
      await api.barbeiro.removerLogo();
      setSugerido(null);
      mudar(null);
    } catch {
      setAviso("Não foi possível remover agora.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className={estilos.campo}>
      <div className={estilos.vitrine}>
        {marca ? (
          <LogoDaBarbearia url={marca.logoUrl} formato={marca.logoFormato} nome={nome} tamanho="g" />
        ) : (
          <span className={estilos.vazia} aria-hidden="true">
            Sem logo
          </span>
        )}
      </div>

      <div className={estilos.controles}>
        {/* Como na capa (CampoDeImagem): o <input> fica escondido, mas
            focável, e o <label> dele tem cara de botão. */}
        <div className={estilos.acoes}>
          <input
            id={id}
            className={estilos.arquivo}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            disabled={ocupado}
            aria-describedby={`${id}-apoio`}
            onChange={(evento) => {
              void aoEscolher(evento.target.files?.[0]);
              evento.target.value = "";
            }}
          />
          <label
            htmlFor={id}
            className={`${estilosDoBotao.botao} ${estilosDoBotao.contorno} ${estilos.escolher}`}
            data-ocupado={ocupado || undefined}
          >
            {ocupado ? "Enviando…" : marca ? "Trocar logo" : "Escolher logo"}
          </label>
          {marca ? (
            <Botao variante="fantasma" onClick={remover} carregando={ocupado}>
              Remover logo
            </Botao>
          ) : null}
        </div>
        <span className={estilos.apoio} id={`${id}-apoio`}>
          512 × 512 px, quadrada. PNG com fundo transparente fica melhor: a moldura segue o formato do desenho.
        </span>

        {marca ? (
          <SeletorEmPilulas
            nome={`${id}-formato`}
            legenda="Moldura"
            opcoes={OPCOES}
            valor={marca.logoFormato}
            aoTrocar={(formato) => void trocarFormato(formato)}
            efeito={
              sugerido
                ? `Pelo arquivo, sugerimos ${ROTULO_DA_SUGESTAO[sugerido]}. Troque se não ficou bom.`
                : undefined
            }
          />
        ) : null}
        {aviso ? <Aviso>{aviso}</Aviso> : null}
      </div>
    </div>
  );
}
