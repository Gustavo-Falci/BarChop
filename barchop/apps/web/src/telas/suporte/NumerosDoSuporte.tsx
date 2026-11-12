"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { NumerosDoSite } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { LadoALado } from "../../componentes/Colunas";
import { CascaDoSuporte } from "../../suporte/CascaDoSuporte";
import { useApiDoSuporte } from "../../suporte/ProvedorDoSuporte";
import { sessaoDoSuporte } from "../../sessao/armazenamento";
import estilos from "./NumerosDoSuporte.module.css";

const ENTRAR = "/painel/suporte/entrar";

const PORCENTAGEM = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function contagem(total: number, um: string, varios: string): string {
  return `${total} ${total === 1 ? um : varios}`;
}

// "2026-11-12" → "12/11", direto do texto: a data já vem no dia de São
// Paulo, e passar por Date arriscaria trocar o dia pelo fuso do navegador.
function diaCurto(dia: string): string {
  const [, mes, numero] = dia.split("-");
  return `${numero}/${mes}`;
}

function Periodo({ titulo, numeros }: { titulo: string; numeros: NumerosDoSite }) {
  const { visitas, cadastros, cadastrosDaHome, taxa } = numeros.totais;
  const id = `periodo-${numeros.dias.length}`;
  return (
    <section className={estilos.periodo} aria-labelledby={id}>
      <h2 id={id} className={estilos.secao}>
        {titulo}
      </h2>
      {taxa === null ? (
        <p className={estilos.semVisitas}>Ainda sem visitas contadas.</p>
      ) : (
        <p className={estilos.taxa}>
          <span className={estilos.numero}>{PORCENTAGEM.format(taxa)}</span>
          <span className={estilos.apoio}>das visitas viraram cadastro</span>
        </p>
      )}
      <p className={estilos.volumes}>
        {contagem(visitas, "visita da home", "visitas da home")} ·{" "}
        {contagem(cadastrosDaHome, "cadastro vindo da home", "cadastros vindos da home")} ·{" "}
        {contagem(cadastros, "cadastro no total", "cadastros no total")}
      </p>
    </section>
  );
}

// A linha de base da home nova (marco 1, PR B): visitas da home atual e
// os cadastros que vieram dela, em 7 e 30 dias, pra comparar com a home
// nova quando ela entrar. Mesma guarda das outras telas do suporte.
export function NumerosDoSuporte() {
  const router = useRouter();
  const api = useApiDoSuporte();
  const [semana, setSemana] = useState<NumerosDoSite | null>(null);
  const [mes, setMes] = useState<NumerosDoSite | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();

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
    Promise.all([api.numeros(7), api.numeros(30)])
      .then(([sete, trinta]) => {
        if (!vivo) return;
        setSemana(sete);
        setMes(trinta);
      })
      .catch((causa) => {
        if (!vivo) return;
        const erro = causa as ErroDaApi;
        if (erro.status === 401) {
          sair();
          return;
        }
        setAviso(erro.mensagem || "Não foi possível carregar os números agora.");
      });
    return () => {
      vivo = false;
    };
  }, [api, router, sair]);

  return (
    <CascaDoSuporte aoSair={sair}>
      <main className={estilos.pagina}>
        <CabecalhoDaPagina
          titulo="Números do site"
          apoio="Visitas da home (uma por aba) e cadastros, contados no servidor, sem cookie. O dia de hoje conta até agora."
        />
        {aviso ? <Aviso>{aviso}</Aviso> : null}

        {semana && mes ? (
          <LadoALado>
            <div className={estilos.periodos}>
              <Periodo titulo="Últimos 7 dias" numeros={semana} />
              <Periodo titulo="Últimos 30 dias" numeros={mes} />
            </div>

            <table className={estilos.tabela}>
              <caption className={estilos.secao}>Por dia</caption>
              <thead>
                <tr>
                  <th scope="col">Dia</th>
                  <th scope="col">Visitas</th>
                  <th scope="col">Da home</th>
                  <th scope="col">Cadastros</th>
                </tr>
              </thead>
              <tbody>
                {[...mes.dias].reverse().map((dia) => (
                  <tr key={dia.dia}>
                    <td>{diaCurto(dia.dia)}</td>
                    <td>{dia.visitas}</td>
                    <td>{dia.cadastrosDaHome}</td>
                    <td>{dia.cadastros}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </LadoALado>
        ) : null}
      </main>
    </CascaDoSuporte>
  );
}
