"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { juntarAreas } from "@barchop/formato";
import type { AreaDeConfiguracao } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { Chip } from "../../../componentes/Chip";
import { descricaoDaArea, proximaFaltando } from "./areas";
import estilos from "./Configuracoes.module.css";

const VOLTAR = { href: "/painel/configuracoes", rotulo: "Configurações" };

// As áreas decididas como a subtela as vê: o que a API mandou mais o que
// foi salvo agora, sem reler — a marca é a mesma regra da API (salvou,
// decidiu), e reler só pra trocar o selo apagaria o formulário por um
// instante.
export function useAreasDecididas(daApi: readonly AreaDeConfiguracao[] | undefined) {
  const [salvasAgora, setSalvasAgora] = useState<AreaDeConfiguracao[]>([]);
  const decididas: AreaDeConfiguracao[] = juntarAreas(daApi ?? [], salvasAgora);
  return {
    decididas,
    marcar: (area: AreaDeConfiguracao) => setSalvasAgora((atuais) => [...atuais, area]),
  };
}

// A moldura de toda subtela de área: voltar pro índice, título com o
// selo (Configurado/Faltando), o aviso de erro e, no fim, o atalho pra
// próxima área que ainda falta.
export function MolduraDaArea({
  area,
  decididas,
  aviso,
  children,
}: {
  area: AreaDeConfiguracao;
  decididas: readonly AreaDeConfiguracao[];
  aviso?: string;
  children: ReactNode;
}) {
  const descricao = descricaoDaArea(area);
  const decidida = decididas.includes(area);
  const proxima = proximaFaltando(decididas, area);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo={descricao.titulo}
        apoio={descricao.apoio}
        voltar={VOLTAR}
        selo={
          <Chip tom={decidida ? "ok" : "atencao"} tamanho="pequeno">
            {decidida ? "Configurado" : "Faltando"}
          </Chip>
        }
      />
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {children}
      {proxima ? (
        <Link
          href={proxima.rota}
          className={estilos.proxima}
          // O nome inteiro numa frase: lido solto, "Dados do negócio →"
          // não diz que é um atalho pra o que ainda falta.
          aria-label={`Próxima área faltando: ${proxima.titulo}`}
        >
          <span className={estilos.proximaRotulo}>Próxima área faltando</span>
          <strong>{proxima.titulo}</strong>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

// Quem não é dono abre a URL de uma área da barbearia (a API recusaria o
// salvar com 403): diz isso e aponta o que é dele.
export function SoODono({ area }: { area: AreaDeConfiguracao }) {
  const descricao = descricaoDaArea(area);
  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina titulo={descricao.titulo} voltar={VOLTAR} />
      <Aviso>
        Só o dono da barbearia muda esta área. Seus dados ficam em{" "}
        <Link href="/painel/configuracoes/perfil">Seu perfil</Link>.
      </Aviso>
    </div>
  );
}
