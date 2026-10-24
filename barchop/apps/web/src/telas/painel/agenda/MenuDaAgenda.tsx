"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { useRequisicao } from "../../../api/useRequisicao";
import { VISTAS, type Vista } from "../../../componentes/SeletorDeVista";
import { depoisDaSaida } from "../../../movimento/depoisDaSaida";
import { IconeBloqueio, IconeEngrenagem } from "../../../painel/icones";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import estilos from "./MenuDaAgenda.module.css";

export interface ProfissionalDoMenu {
  id: string;
  nome: string;
  // O mesmo tom dos blocos da grade (data-tom 0–5).
  tom: number;
}

// O menu da agenda no celular (agenda no celular, PR 3), o ☰ do Google
// Agenda: a vista, quem aparece e os atalhos. Uma <dialog> que entra pela
// esquerda; escolher uma vista navega e fecha.
export function MenuDaAgenda({
  nomeDaBarbearia,
  vista,
  hoje,
  profissionais,
  marcados,
  aoTrocarVista,
  aoAlternar,
  aoBloquear,
  aoFechar,
}: {
  nomeDaBarbearia: string | null;
  vista: Vista;
  hoje: string;
  // Ausente pra quem só vê a própria agenda: não há quem escolher.
  profissionais?: ProfissionalDoMenu[];
  // Quem está na agenda agora; ausente, todo mundo.
  marcados?: Set<string>;
  aoTrocarVista: (vista: Vista) => void;
  aoAlternar: (id: string) => void;
  // Ausente (no mês), o atalho não aparece.
  aoBloquear?: () => void;
  aoFechar: () => void;
}) {
  const api = useApiDoPainel();
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const comEquipe = profissionais !== undefined && profissionais.length > 1;

  // Quantos cada um tem hoje, ao lado do nome. Só com a equipe à vista, e
  // só enquanto o menu está aberto (ele é montado ao abrir).
  const deHoje = useRequisicao(
    () => (comEquipe ? api.barbeiro.agendamentosDoIntervalo(hoje, hoje) : Promise.resolve([])),
    [comEquipe, hoje]
  );
  const quantosHoje = (id: string) =>
    (deHoje.dados ?? []).filter((a) => a.barbeiro.id === id && a.status !== "cancelado").length;

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  const fechar = () => janela.current?.close();
  const estaMarcado = (id: string) => !marcados || marcados.has(id);
  const quantosMarcados = (profissionais ?? []).filter((p) => estaMarcado(p.id)).length;

  return (
    <dialog
      ref={janela}
      className={estilos.menu}
      aria-labelledby={titulo}
      onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}
      // Toque no véu (fora do painel) fecha, como em qualquer gaveta.
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <div className={estilos.conteudo}>
        <header className={estilos.cabecalho}>
          {nomeDaBarbearia ? <p className={estilos.casa}>{nomeDaBarbearia}</p> : null}
          <h2 id={titulo} className={estilos.titulo}>
            Agenda
          </h2>
        </header>

        <section aria-label="Ver como" className={estilos.secao}>
          <h3 className={estilos.rotulo} aria-hidden="true">
            Ver como
          </h3>
          <ul className={estilos.itens}>
            {VISTAS.map((opcao) => (
              <li key={opcao.valor}>
                <button
                  type="button"
                  className={estilos.item}
                  aria-pressed={opcao.valor === vista}
                  onClick={() => {
                    aoTrocarVista(opcao.valor);
                    fechar();
                  }}
                >
                  {opcao.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {comEquipe ? (
          // A linha de cima mora no bloco, e não no <fieldset>: com
          // borda, o <legend> senta em cima dela e é cortado por ela.
          <div className={estilos.secao}>
            <fieldset className={estilos.grupo}>
              <legend className={estilos.rotulo}>Profissionais</legend>
              <ul className={estilos.itens}>
                {profissionais.map((pessoa) => {
                  const marcado = estaMarcado(pessoa.id);
                  const quantos = quantosHoje(pessoa.id);
                  return (
                    <li key={pessoa.id}>
                      <label className={estilos.pessoa} data-tom={pessoa.tom}>
                        <input
                          type="checkbox"
                          className={estilos.caixa}
                          checked={marcado}
                          // A última marcada não sai: agenda de ninguém é
                          // uma tela vazia, não um filtro.
                          disabled={marcado && quantosMarcados === 1}
                          onChange={() => aoAlternar(pessoa.id)}
                        />
                        <span className={estilos.nome}>{pessoa.nome}</span>
                        {deHoje.dados ? <span className={estilos.contagem}>{quantos} hoje</span> : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </div>
        ) : null}

        <div className={estilos.atalhos}>
          {aoBloquear ? (
            <button
              type="button"
              className={estilos.item}
              onClick={() => {
                fechar();
                aoBloquear();
              }}
            >
              <IconeBloqueio /> Bloquear horário
            </button>
          ) : null}
          <Link href="/painel/configuracoes/regras-de-agendamento" className={estilos.item}>
            <IconeEngrenagem /> Regras de agendamento
          </Link>
        </div>
      </div>
    </dialog>
  );
}
