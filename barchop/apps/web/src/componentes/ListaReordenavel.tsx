"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState, type ReactNode } from "react";

import { CURVA, DURACAO, curvaCss } from "../movimento/tokens";
import { Aviso } from "./Aviso";
import estilos from "./ListaReordenavel.module.css";

// Uma lista que o dono reordena arrastando (arrastar e reordenar, PR 3;
// ADR-0011). Serve aos serviços, às categorias e à equipe.
//
// Mouse, toque e teclado no mesmo motor, sempre pela alça (⋮⋮) — o
// resto da linha continua clicável e rolável:
//   - mouse: anda 4px antes de pegar, pra clique não virar arrasto;
//   - toque: segura 250ms, pra rolar a página continuar rolando;
//   - teclado: espaço pega, setas movem, espaço solta, Esc cancela.
// Mouse e toque em sensores separados, e não o PointerSensor: o de
// ponteiro pegaria o toque sem a espera.
//
// Salva ao soltar, otimista: a tela já fica na ordem nova e manda a
// lista inteira (`aoReordenar`). Deu erro, volta à ordem que veio e avisa.

const instrucoes: ScreenReaderInstructions = {
  draggable:
    "Pra mover, aperte espaço. Use as setas pra cima e pra baixo, espaço de novo pra soltar e Esc pra cancelar.",
};

export function ListaReordenavel<T extends { id: string }>({
  itens,
  nomeDaLista,
  rotulo,
  aoReordenar,
  renderizar,
}: {
  itens: T[];
  // O nome da lista pro leitor de tela ("Serviços de Cabelo").
  nomeDaLista: string;
  // Como o item é lido na alça e nos anúncios ("Corte").
  rotulo: (item: T) => string;
  aoReordenar: (ids: string[]) => Promise<void>;
  // A linha inteira; `alca` é o botão de arrastar, pra pôr onde couber.
  renderizar: (item: T, alca: ReactNode) => ReactNode;
}) {
  // A ordem da tela enquanto a nova não volta de quem usa a lista. Nula =
  // a de `itens`. Itens novos (salvou, recarregou) descartam a otimista:
  // eles são a verdade. "Novos" pelos ids, e não pelo array: quem usa a
  // lista recalcula os grupos a cada render, e um array novo na mesma
  // ordem antiga faria a tela piscar de volta antes de o salvamento voltar.
  const [ordemOtimista, setOrdemOtimista] = useState<string[] | null>(null);
  const chave = itens.map((item) => item.id).join(" ");
  const [chaveVista, setChaveVista] = useState(chave);
  const [falhou, setFalhou] = useState(false);
  const saiuDoLugar = useRef(false);
  if (chave !== chaveVista) {
    setChaveVista(chave);
    setOrdemOtimista(null);
  }

  const porId = new Map(itens.map((item) => [item.id, item]));
  const ids = ordemOtimista ?? itens.map((item) => item.id);
  const naTela = ids.flatMap((id) => porId.get(id) ?? []);

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const nome = (id: UniqueIdentifier) => {
    const item = porId.get(String(id));
    return item ? rotulo(item) : "Item";
  };
  const posicao = (id: UniqueIdentifier) => `${ids.indexOf(String(id)) + 1} de ${ids.length}`;
  const anuncios: Announcements = {
    onDragStart: ({ active }) => {
      saiuDoLugar.current = false;
      return `${nome(active.id)} pego. Posição ${posicao(active.id)}.`;
    },
    // O dnd-kit avisa "sobre" logo ao pegar, com o item sobre ele mesmo:
    // sem esta guarda, o "pego" seria trocado na hora por "na posição 1".
    onDragOver: ({ active, over }) => {
      if (!saiuDoLugar.current && over?.id === active.id) return undefined;
      saiuDoLugar.current = true;
      return over ? `${nome(active.id)} na posição ${posicao(over.id)}.` : `${nome(active.id)} fora da lista.`;
    },
    onDragEnd: ({ active, over }) =>
      over ? `${nome(active.id)} solto na posição ${posicao(over.id)}.` : `${nome(active.id)} solto.`,
    onDragCancel: ({ active }) =>
      `Movimento cancelado. ${nome(active.id)} voltou pra posição ${posicao(active.id)}.`,
  };

  async function soltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const nova = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrdemOtimista(nova);
    setFalhou(false);
    try {
      await aoReordenar(nova);
    } catch {
      setOrdemOtimista(null);
      setFalhou(true);
    }
  }

  return (
    <>
      <DndContext
        sensors={sensores}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        accessibility={{ announcements: anuncios, screenReaderInstructions: instrucoes }}
        onDragEnd={soltar}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className={estilos.lista} aria-label={nomeDaLista}>
            {naTela.map((item) => (
              <Linha key={item.id} id={item.id} rotulo={rotulo(item)}>
                {(alca) => renderizar(item, alca)}
              </Linha>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {falhou ? <Aviso>Não deu pra salvar a ordem. Ela voltou como estava; tente de novo.</Aviso> : null}
    </>
  );
}

// Os vizinhos abrem espaço com a curva e a duração dos tokens, como o
// resto do movimento do painel. Com "reduzir movimento" no sistema, a
// regra global do globals.css zera a transição (o !important dela vence
// o estilo inline).
const transicao = { duration: DURACAO.media * 1000, easing: curvaCss(CURVA.entrada) };

function Linha({
  id,
  rotulo,
  children,
}: {
  id: string;
  rotulo: string;
  children: (alca: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, transition: transicao });

  const alca = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={estilos.alca}
      aria-label={`Arrastar ${rotulo}`}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden="true">⋮⋮</span>
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? `${estilos.linha} ${estilos.pega}` : estilos.linha}
      // Translate, e não Transform: o Transform levaria a escala que o
      // dnd-kit calcula entre linhas de alturas diferentes e esticaria
      // o conteúdo.
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children(alca)}
    </li>
  );
}
