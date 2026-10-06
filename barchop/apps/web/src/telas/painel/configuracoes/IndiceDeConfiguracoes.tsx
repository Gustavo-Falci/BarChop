"use client";

import Link from "next/link";
import type { AreaDeConfiguracao, BarbeariaDoPainel, HorarioSerializado } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { SecaoNumerada } from "../../../componentes/SecaoNumerada";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { AREAS, resumoDaArea, type DescricaoDaArea } from "./areas";
import { SeuPerfil } from "./SeuPerfil";
import estilos from "./Configuracoes.module.css";

// Os grupos do índice, como no concorrente de referência: o que faz a
// agenda funcionar e o que o cliente vê.
const GRUPOS: { titulo: string; areas: AreaDeConfiguracao[] }[] = [
  { titulo: "Operação", areas: ["horarios"] },
  { titulo: "Canais com clientes", areas: ["dados_do_negocio", "comunicacao", "notificacoes"] },
];

function LinhaDaArea({
  descricao,
  decidida,
  barbearia,
  horarios,
}: {
  descricao: DescricaoDaArea;
  decidida: boolean;
  barbearia: BarbeariaDoPainel;
  horarios: HorarioSerializado[];
}) {
  return (
    <li>
      <Link href={descricao.rota} className={decidida ? estilos.linha : `${estilos.linha} ${estilos.faltando}`}>
        <strong className={estilos.nomeDaArea}>{descricao.titulo}</strong>
        <span className={estilos.valor}>
          {decidida ? resumoDaArea(descricao.area, barbearia, horarios) : descricao.consequencia}
        </span>
        {decidida ? (
          <span className={estilos.seta} aria-hidden="true">
            ›
          </span>
        ) : (
          <span className={estilos.configurar}>
            Configurar <span aria-hidden="true">→</span>
          </span>
        )}
      </Link>
    </li>
  );
}

// /painel/configuracoes. Pro dono, o índice das áreas (painel v2, marco
// 2): cada linha diz o que vale hoje ou, se a área nunca foi salva, o
// que acontece se ficar assim. Pro resto da equipe, só o próprio perfil
// — as áreas são da barbearia, e a API recusa o salvar de quem não é dono.
export function IndiceDeConfiguracoes() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") return <SeuPerfil comVoltar={false} />;
  return <IndiceDoDono />;
}

function IndiceDoDono() {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  const erro = barbearia.erro ?? horarios.erro;
  if (erro) return <Aviso>{erro.mensagem || "Não foi possível carregar as configurações agora."}</Aviso>;
  if (!barbearia.dados || !horarios.dados) return <p>Carregando…</p>;

  const decididas = barbearia.dados.areasDecididas;
  const total = AREAS.length;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Configurações"
        apoio="Cada linha mostra o que vale hoje. As em âmbar ainda não foram salvas — o texto diz o que acontece se ficar assim."
        acao={
          <div className={estilos.progresso}>
            <p className={estilos.contagem}>
              {decididas.length} de {total} decididas
            </p>
            <div
              role="progressbar"
              aria-label="Áreas decididas"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={decididas.length}
              className={estilos.barra}
            >
              <span style={{ width: `${(decididas.length / total) * 100}%` }} />
            </div>
          </div>
        }
      />

      {GRUPOS.map((grupo) => {
        const faltando = grupo.areas.filter((area) => !decididas.includes(area)).length;
        return (
          <SecaoNumerada
            key={grupo.titulo}
            titulo={grupo.titulo}
            lado={faltando > 0 ? `${faltando} faltando` : undefined}
          >
            <ul className={estilos.lista}>
              {grupo.areas.map((area) => (
                <LinhaDaArea
                  key={area}
                  descricao={AREAS.find((item) => item.area === area)!}
                  decidida={decididas.includes(area)}
                  barbearia={barbearia.dados!}
                  horarios={horarios.dados!}
                />
              ))}
            </ul>
          </SecaoNumerada>
        );
      })}

      {/* O perfil é de cada pessoa da equipe, não da barbearia: fica
          fora da contagem e sem o "Configurar". */}
      <SecaoNumerada titulo="Você">
        <ul className={estilos.lista}>
          <li>
            <Link href="/painel/configuracoes/perfil" className={estilos.linha}>
              <strong className={estilos.nomeDaArea}>Seu perfil</strong>
              <span className={estilos.valor}>
                {perfil.nome}
                {perfil.telefone ? ` · ${perfil.telefone}` : ""}
              </span>
              <span className={estilos.seta} aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        </ul>
      </SecaoNumerada>
    </div>
  );
}
