"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Botao } from "../componentes/Botao";
import { formatarPreco, ItemDeServico } from "../componentes/ItemDeServico";
import { Resumo } from "../componentes/Resumo";
import { caminhoDoPasso } from "../fluxo/passos";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import estilos from "./EscolhaDeServicos.module.css";

export function EscolhaDeServicos() {
  const { slug, servicoIds, remarcar, profissional } = usePassoDoFluxo("servicos");
  const router = useRouter();
  const api = useApi();
  const { dados, carregando, erro } = useRequisicao(
    () => api.publico.servicos(slug),
    [slug]
  );

  // Começa do que veio na URL: voltar do passo seguinte não pode perder
  // a escolha.
  const [escolhidos, setEscolhidos] = useState<string[]>(servicoIds);

  const servicos = dados ?? [];
  const selecionados = servicos.filter((s) => escolhidos.includes(s.id));
  const duracao = selecionados.reduce((t, s) => t + s.duracaoMinutos, 0);
  // centavo somado como float é o defeito que o preço em string existe pra evitar.
  const totalEmCentavos = selecionados.reduce(
    (soma, servico) => soma + Math.round(Number(servico.preco) * 100),
    0
  );

  function alternar(id: string) {
    setEscolhidos((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]
    );
  }

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1>Não foi possível carregar os serviços</h1>
      </main>
    );
  }

  return (
    <main className={`${estilos.pagina} ${estilos.duasColunas}`}>
      <h1 className={estilos.titulo}>Serviços</h1>

      <div className={estilos.lista}>
        {servicos.map((servico) => (
          <ItemDeServico
            key={servico.id}
            servico={servico}
            marcado={escolhidos.includes(servico.id)}
            aoAlternar={alternar}
          />
        ))}
      </div>

      {/* O que foi escolhido e o botão de seguir, juntos: no desktop
          viram a coluna da direita e acompanham a rolagem da lista. */}
      <div className={estilos.lateral}>
        {selecionados.length > 0 ? (
          <Resumo
            itens={[
              `${selecionados.length} ${
                selecionados.length === 1 ? "serviço" : "serviços"
              }`,
              `${duracao} min`,
              formatarPreco((totalEmCentavos / 100).toFixed(2)),
            ]}
          />
        ) : null}

        <Botao
          disabled={escolhidos.length === 0}
          onClick={() =>
            router.push(
              // Remarcar não troca de profissional (a API mantém o do
              // agendamento): vai direto pro dia, levando quem atende.
              remarcar
                ? caminhoDoPasso(slug, "data", {
                    servicoIds: selecionados.map((s) => s.id),
                    remarcar,
                    profissional,
                  })
                : caminhoDoPasso(slug, "profissional", {
                    servicoIds: selecionados.map((s) => s.id),
                  })
            )
          }
        >
          Continuar
        </Botao>
      </div>
    </main>
  );
}
