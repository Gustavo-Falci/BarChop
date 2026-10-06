import type { ComponentType, SVGProps } from "react";
import {
  IconeBrilho,
  IconeCoroa,
  IconeGota,
  IconeNavalha,
  IconeTesoura,
} from "../painel/icones";

// A categoria é texto livre, então o ícone sai de palavra-chave, sem
// acento e sem caixa: "Cortes", "Cabelo e barba", "Tratamentos". A
// primeira regra que casa ganha, e "Cabelo e barba" fica com a tesoura.
// Nada casou: o brilho, neutro.
const REGRAS: [RegExp, ComponentType<SVGProps<SVGSVGElement>>][] = [
  [/corte|cabelo|degrade|infantil|tesoura/, IconeTesoura],
  [/barba|bigode|navalha/, IconeNavalha],
  [/tratamento|hidrata|sobrancelha|pigment|platinad|luzes|quimica|estetica|pele/, IconeGota],
  [/especia|pacote|combo|noivo|dia do|premium|vip/, IconeCoroa],
];

export function iconeDaCategoria(categoria: string): ComponentType<SVGProps<SVGSVGElement>> {
  const chave = categoria
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return REGRAS.find(([padrao]) => padrao.test(chave))?.[1] ?? IconeBrilho;
}
