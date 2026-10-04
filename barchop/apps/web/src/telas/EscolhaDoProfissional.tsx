"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { caminhoDoPasso } from "../fluxo/passos";
import { profissionaisQueFazem } from "../fluxo/profissionais";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import estilos from "./EscolhaDoProfissional.module.css";
import { useNoHost } from "../tenant/ProvedorDoHost";

// O passo entre os serviços e o dia: com quem, ou "qualquer um". Só
// aparece quem faz todos os serviços escolhidos. Com uma pessoa só não
// há o que escolher, e o passo some — segue direto pro dia.
export function EscolhaDoProfissional() {
  const { slug, servicoIds, remarcar, pronto } = usePassoDoFluxo("profissional");
  const router = useRouter();
  const noHost = useNoHost();
  const api = useApi();

  const perfil = useRequisicao(
    async () => (pronto ? api.publico.perfilDaBarbearia(slug) : null),
    [slug, pronto]
  );
  const elegiveis = perfil.dados
    ? profissionaisQueFazem(perfil.dados.barbeiros, servicoIds)
    : null;
  const sozinho = elegiveis?.length === 1;

  useEffect(() => {
    // `replace`: o passo pulado não merece entrada no histórico, senão o
    // "voltar" do dia cairia aqui e seria jogado pra frente de novo.
    // Sem `profissional` na URL é "qualquer um" — com uma pessoa só, é
    // ela mesma.
    if (sozinho) router.replace(noHost(caminhoDoPasso(slug, "data", { servicoIds, remarcar })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitivos, ver usePassoDoFluxo
  }, [sozinho, slug, servicoIds.join(","), remarcar, router, noHost]);

  function seguir(profissional?: string) {
    router.push(noHost(caminhoDoPasso(slug, "data", { servicoIds, remarcar, profissional })));
  }

  if (!pronto) return null;
  if (perfil.erro) {
    return (
      <main className={estilos.pagina}>
        <h1>Não foi possível carregar a equipe</h1>
      </main>
    );
  }
  if (!elegiveis || sozinho) return <main className={estilos.pagina}>Carregando…</main>;

  if (elegiveis.length === 0) {
    return (
      <main className={estilos.pagina}>
        <h1>Com quem?</h1>
        <p>Ninguém da equipe faz todos esses serviços juntos.</p>
        <Link className={estilos.voltar} href={noHost(caminhoDoPasso(slug, "servicos", { servicoIds, remarcar }))}>
          Escolher outros serviços
        </Link>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Com quem?</h1>
      <ul className={estilos.lista}>
        {/* Primeiro: é o que mais abre horário — a agenda de todo mundo
            junta. */}
        <li>
          <button type="button" className={estilos.opcao} onClick={() => seguir()}>
            <strong>Qualquer um</strong>
            <span className={estilos.apoio}>Quem estiver livre no horário</span>
          </button>
        </li>
        {elegiveis.map((barbeiro) => (
          <li key={barbeiro.id}>
            <button type="button" className={estilos.opcao} onClick={() => seguir(barbeiro.id)}>
              <strong>{barbeiro.nome}</strong>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
