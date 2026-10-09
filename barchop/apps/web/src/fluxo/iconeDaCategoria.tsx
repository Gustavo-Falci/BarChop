import type { ComponentType, SVGProps } from "react";
import type { CategoriaDeServico } from "@barchop/formato";
import {
  IconeBrilho,
  IconeCoroa,
  IconeGota,
  IconeNavalha,
  IconeTesoura,
} from "../painel/icones";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;

// Um ícone por categoria da lista; `Record` faz categoria nova sem ícone
// ser erro de type-check. Sem categoria ("Outros serviços"): o brilho,
// neutro.
const ICONES: Record<CategoriaDeServico, Icone> = {
  cabelo: IconeTesoura,
  barba: IconeNavalha,
  combo: IconeCoroa,
  sobrancelha: IconeGota,
  quimica: IconeGota,
  infantil: IconeTesoura,
};

export function iconeDaCategoria(categoria: CategoriaDeServico | null): Icone {
  return categoria ? ICONES[categoria] : IconeBrilho;
}
