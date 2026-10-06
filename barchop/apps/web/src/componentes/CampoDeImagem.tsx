"use client";

import { useId, useState } from "react";
import { ErroDaApi } from "@barchop/api-client";
import { redimensionarImagem } from "../painel/redimensionar";
import { Aviso } from "./Aviso";
import { Botao } from "./Botao";
import estilos from "./CampoDeImagem.module.css";

// Capa da barbearia, foto do profissional e do serviço: prévia, trocar e
// remover.
// Cada troca salva na hora (a API guarda o arquivo e grava a chave), sem
// passar pelo "Salvar" do formulário em volta.
export function CampoDeImagem({
  rotulo,
  alt,
  urlAtual,
  enviar,
  remover,
  formato = "paisagem",
}: {
  rotulo: string;
  // O texto alternativo da prévia: "Capa da barbearia", "Foto de Ana".
  alt: string;
  urlAtual: string | null;
  enviar: (arquivo: Blob) => Promise<string>;
  remover: () => Promise<void>;
  formato?: "paisagem" | "retrato" | "quadrado";
}) {
  const id = useId();
  const [url, setUrl] = useState(urlAtual);
  const [aviso, setAviso] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState(false);

  // A leitura do servidor chega depois do primeiro render.
  const [sincronizada, setSincronizada] = useState(urlAtual);
  if (urlAtual !== sincronizada) {
    setSincronizada(urlAtual);
    setUrl(urlAtual);
  }

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setAviso(undefined);
    setOcupado(true);
    try {
      setUrl(await enviar(await redimensionarImagem(arquivo)));
    } catch (causa) {
      const codigo = causa instanceof ErroDaApi ? causa.codigo : "";
      setAviso(
        codigo === "arquivo_grande_demais"
          ? "Imagem grande demais. Tente uma foto menor."
          : codigo === "tipo_de_imagem_invalido"
            ? "Use uma foto em JPG, PNG ou WebP."
            : "Não foi possível enviar a imagem agora."
      );
    } finally {
      setOcupado(false);
    }
  }

  async function aoRemover() {
    setAviso(undefined);
    setOcupado(true);
    try {
      await remover();
      setUrl(null);
    } catch {
      setAviso("Não foi possível remover agora.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className={estilos.campo}>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
      </label>
      {url ? (
        // <img> simples: a imagem vem do bucket (ou da API em
        // desenvolvimento), e o otimizador do Next exigiria liberar os
        // dois domínios.
        <img className={`${estilos.previa} ${estilos[formato]}`} src={url} alt={alt} />
      ) : null}
      <input
        id={id}
        className={estilos.arquivo}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={ocupado}
        onChange={(evento) => {
          void aoEscolher(evento.target.files?.[0]);
          evento.target.value = "";
        }}
      />
      {url ? (
        <Botao variante="contorno" onClick={aoRemover} carregando={ocupado}>
          Remover {rotulo.toLowerCase()}
        </Botao>
      ) : null}
      {aviso ? <Aviso>{aviso}</Aviso> : null}
    </div>
  );
}
