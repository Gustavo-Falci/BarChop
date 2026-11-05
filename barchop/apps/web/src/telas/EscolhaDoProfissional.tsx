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
import { Carregando } from "../componentes/Carregando";
import { IndicadorDePasso } from "../componentes/IndicadorDePasso";
import { formatarPreco } from "../componentes/ItemDeServico";
import { Resumo } from "../componentes/Resumo";
import { iniciais } from "../formato/iniciais";
import { IconeSeta } from "../painel/icones";
import { m } from "motion/react";
import { useDeslizeDoPasso } from "../movimento/passo";

// O passo entre os serviços e o dia: com quem, ou "qualquer um". Só
// aparece quem faz todos os serviços escolhidos. Com uma pessoa só não
// há o que escolher, e o passo some — segue direto pro dia.
export function EscolhaDoProfissional() {
  const { slug, servicoIds, remarcar, pronto } = usePassoDoFluxo("profissional");
  const deslize = useDeslizeDoPasso("profissional");
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
  // O resumo do que já foi escolhido (onda B): quem escolhe com quem
  // ainda vê o que vai fazer. Se a lista falhar, o passo segue sem ele.
  const servicos = useRequisicao(
    async () => (pronto ? api.publico.servicos(slug) : null),
    [slug, pronto]
  );
  const escolhidos = (servicos.dados ?? []).filter((servico) => servicoIds.includes(servico.id));
  const resumo =
    escolhidos.length > 0
      ? [
          escolhidos.map((servico) => servico.nome).join(", "),
          `${escolhidos.reduce((soma, servico) => soma + servico.duracaoMinutos, 0)} min`,
          formatarPreco(
            (
              escolhidos.reduce((soma, servico) => soma + Math.round(Number(servico.preco) * 100), 0) / 100
            ).toFixed(2)
          ),
        ]
      : null;

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
  if (!elegiveis || sozinho) return <main className={estilos.pagina}><Carregando /></main>;

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
    <m.main className={estilos.pagina} {...deslize}>
      <Link className={estilos.passoAnterior} href={noHost(caminhoDoPasso(slug, "servicos", { servicoIds, remarcar }))}>
        <IconeSeta width="16" height="16" className={estilos.setaDeVolta} />
        Serviços
      </Link>
      <IndicadorDePasso atual={2} />
      <h1>Com quem?</h1>
      {resumo ? (
        <section aria-label="Sua escolha">
          <Resumo itens={resumo} />
        </section>
      ) : null}
      {/* Um toque já segue pro dia, sem marcar e "Continuar": seria um
          toque a mais por agendamento (decisão do plano da onda B). */}
      <ul className={estilos.lista}>
        {/* Primeiro: é o que mais abre horário — a agenda de todo mundo
            junta. */}
        <li>
          <button type="button" className={estilos.opcao} onClick={() => seguir()}>
            <span className={`${estilos.foto} ${estilos.qualquer}`} aria-hidden="true" />
            <span className={estilos.texto}>
              <strong>Qualquer um</strong>
              <span className={estilos.apoio}>Quem estiver livre no horário: mais opções</span>
            </span>
            <IconeSeta width="18" height="18" className={estilos.seta} aria-hidden="true" />
          </button>
        </li>
        {elegiveis.map((barbeiro) => (
          <li key={barbeiro.id}>
            <button type="button" className={estilos.opcao} onClick={() => seguir(barbeiro.id)}>
              {/* Foto ou iniciais, enfeite: o nome do botão é só o nome. */}
              {barbeiro.fotoUrl ? (
                <img className={estilos.foto} src={barbeiro.fotoUrl} alt="" />
              ) : (
                <span className={estilos.foto} aria-hidden="true">
                  {iniciais(barbeiro.nome)}
                </span>
              )}
              <span className={estilos.texto}>
                <strong>{barbeiro.nome}</strong>
              </span>
              <IconeSeta width="18" height="18" className={estilos.seta} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </m.main>
  );
}
