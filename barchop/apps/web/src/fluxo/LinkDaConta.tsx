"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTemSessaoDoCliente } from "../sessao/useSessaoDoCliente";
import { useNoHost } from "../tenant/ProvedorDoHost";
import estilos from "./LinkDaConta.module.css";

// O caminho de quem já tem conta até ela. Sem ele, cancelar e remarcar
// só existiam pra quem soubesse digitar /<slug>/minha-conta.
//
// Um link só, que muda com a sessão, em vez de dois lado a lado: quem
// está logado não precisa de "Entrar", e quem não está seria mandado
// pra lista só pra ser devolvido ao login.
export function LinkDaConta({ slug }: { slug: string }) {
  const pathname = usePathname();
  const temSessao = useTemSessaoDoCliente(slug);
  const noHost = useNoHost();

  if (temSessao === undefined) return null;

  const [destino, rotulo] = temSessao
    ? [noHost(`/${slug}/minha-conta`), "Meus agendamentos"]
    : [noHost(`/${slug}/entrar`), "Entrar"];

  // Na própria tela de destino o link apontaria pra onde a pessoa já
  // está.
  if (pathname === destino) return null;

  return (
    <Link href={destino} className={estilos.link}>
      {rotulo}
    </Link>
  );
}
