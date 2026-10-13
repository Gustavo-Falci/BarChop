"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { AvisoPublicado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { LadoALado } from "../../componentes/Colunas";
import { useApiDoSuporte } from "../../suporte/ProvedorDoSuporte";
import { sessaoDoSuporte } from "../../sessao/armazenamento";
import estilos from "./AvisosDoSuporte.module.css";

const ENTRAR = "/painel/suporte/entrar";

// Os mesmos limites e o mesmo padrão de link do schema de POST
// /suporte/avisos (apps/api/src/routers/avisos.ts).
const TITULO_MAX = 120;
const TEXTO_MAX = 500;
const LINK_VALIDO = /^(\/painel(\/\S*)?|https:\/\/\S+)$/;

const FORMATADOR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

interface Erros {
  titulo?: string;
  texto?: string;
  link?: string;
}

// Os avisos da plataforma (plano barra-do-topo, PR D): o que se publica
// aqui cai no sino de cada membro ativo de cada barbearia, na aba
// Avisos. Mesma guarda da fila do suporte.
export function AvisosDoSuporte() {
  const router = useRouter();
  const api = useApiDoSuporte();
  const idDoTexto = useId();
  const [publicados, setPublicados] = useState<AvisoPublicado[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [link, setLink] = useState("");
  const [erros, setErros] = useState<Erros>({});
  const [aviso, setAviso] = useState<string | undefined>();
  const [publicado, setPublicado] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const sair = useCallback(() => {
    sessaoDoSuporte.limpar();
    router.replace(ENTRAR);
  }, [router]);

  useEffect(() => {
    if (!sessaoDoSuporte.ler()) {
      router.replace(ENTRAR);
      return;
    }
    let vivo = true;
    api
      .avisos()
      .then((lista) => {
        if (vivo) setPublicados(lista);
      })
      .catch((causa) => {
        if (!vivo) return;
        const erro = causa as ErroDaApi;
        if (erro.status === 401) {
          sair();
          return;
        }
        setAviso(erro.mensagem || "Não foi possível carregar os avisos agora.");
      });
    return () => {
      vivo = false;
    };
  }, [api, router, sair]);

  async function publicar(evento: FormEvent) {
    evento.preventDefault();
    setAviso(undefined);
    setPublicado(undefined);

    const limpo = { titulo: titulo.trim(), texto: texto.trim(), link: link.trim() };
    const novosErros: Erros = {};
    if (limpo.titulo.length < 2) novosErros.titulo = "Escreva o título.";
    if (limpo.texto.length < 2) novosErros.texto = "Escreva o texto do aviso.";
    if (limpo.link && !LINK_VALIDO.test(limpo.link)) {
      novosErros.link = "Use um caminho do painel (/painel/…) ou um endereço https://.";
    }
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEnviando(true);
    try {
      const novo = await api.publicarAviso({
        titulo: limpo.titulo,
        texto: limpo.texto,
        ...(limpo.link ? { link: limpo.link } : {}),
      });
      setPublicados((atual) => [novo, ...(atual ?? [])]);
      setTitulo("");
      setTexto("");
      setLink("");
      setPublicado(
        `Aviso publicado para ${novo.destinatarios} ${novo.destinatarios === 1 ? "pessoa" : "pessoas"}.`
      );
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.status === 401) {
        sair();
        return;
      }
      setAviso(erro.mensagem || "Não foi possível publicar agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Avisos da plataforma"
        apoio="O que você publica aqui cai no sino de todos os membros ativos, de todas as barbearias, na aba Avisos."
        voltar={{ href: "/painel/suporte", rotulo: "Pedidos de troca de link" }}
        acao={
          <Botao variante="fantasma" onClick={sair}>
            Sair
          </Botao>
        }
      />
      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <LadoALado>
        <form className={estilos.formulario} onSubmit={publicar} noValidate>
          <h2 className={estilos.secao}>Novo aviso</h2>
          <Campo
            rotulo="Título"
            valor={titulo}
            onChange={setTitulo}
            maxLength={TITULO_MAX}
            erro={erros.titulo}
          />
          <div className={estilos.campoDeTexto}>
            <label className={estilos.rotulo} htmlFor={idDoTexto}>
              Texto
            </label>
            <textarea
              id={idDoTexto}
              className={estilos.area}
              rows={4}
              maxLength={TEXTO_MAX}
              aria-invalid={erros.texto ? "true" : undefined}
              aria-describedby={erros.texto ? `${idDoTexto}-erro` : undefined}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {erros.texto ? (
              <span className={estilos.erro} id={`${idDoTexto}-erro`}>
                {erros.texto}
              </span>
            ) : null}
          </div>
          <Campo
            rotulo="Link (opcional)"
            apoio="Um caminho do painel, como /painel/ajuda, ou um endereço https://."
            valor={link}
            onChange={setLink}
            maxLength={300}
            erro={erros.link}
          />
          <div>
            <Botao type="submit" carregando={enviando}>
              Publicar aviso
            </Botao>
          </div>
          {publicado ? <Aviso tom="sucesso">{publicado}</Aviso> : null}
        </form>

        <section className={estilos.publicados} aria-labelledby="avisos-publicados">
          <h2 id="avisos-publicados" className={estilos.secao}>
            Publicados
          </h2>
          {publicados === null ? null : publicados.length === 0 ? (
            <p className={estilos.vazio}>Nenhum aviso publicado ainda.</p>
          ) : (
            <ol className={estilos.lista}>
              {publicados.map((item) => (
                <li key={item.id}>
                  <article className={estilos.aviso} aria-label={item.titulo}>
                    <strong>{item.titulo}</strong>
                    <p>{item.texto}</p>
                    <p className={estilos.apoio}>
                      {FORMATADOR.format(new Date(item.criadoEm))}
                      {item.link ? ` · ${item.link}` : ""}
                    </p>
                    <p className={estilos.leitura}>{`${item.lidas} de ${item.destinatarios} leram`}</p>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </section>
      </LadoALado>
    </main>
  );
}
