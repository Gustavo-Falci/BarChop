"use client";

import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { BotaoLink } from "../componentes/Botao";
import { caminhoDosPlanos, comQuemVale } from "../fluxo/planos";
import { precoDoCiclo } from "../painel/planos";
import { useNoHost } from "../tenant/ProvedorDoHost";
import estilos from "./PlanosDaBarbearia.module.css";

// A vitrine na página da barbearia (Onda 2, marco 3, PR 11): os planos
// em resumo, e o "Conhecer os planos" leva pra tela de assinar. Sem
// plano, ou se a requisição falhar, a seção some: é convite, não
// conteúdo, como os próximos horários.
export function PlanosNaPagina({ slug }: { slug: string }) {
  const api = useApi();
  const noHost = useNoHost();
  const vitrine = useRequisicao(() => api.publico.planos(slug), [slug]);
  const planos = vitrine.dados?.planos ?? [];
  if (planos.length === 0) return null;

  return (
    <section className={estilos.secaoNaPagina} aria-labelledby="planos-na-pagina">
      <h2 id="planos-na-pagina" className={estilos.tituloNaPagina}>
        Planos de assinatura
      </h2>
      <ul className={estilos.resumo}>
        {planos.map((plano) => (
          <li key={plano.id} className={estilos.linhaDoResumo}>
            <span className={estilos.nome}>{plano.nome}</span>
            <span>{precoDoCiclo(plano)}</span>
            <span className={estilos.apoio}>{comQuemVale(plano)}</span>
          </li>
        ))}
      </ul>
      <div>
        <BotaoLink href={noHost(caminhoDosPlanos(slug))} variante="contorno">
          Conhecer os planos
        </BotaoLink>
      </div>
    </section>
  );
}
