"use client";

import Link from "next/link";
import type {
  AreaDeConfiguracao,
  BarbeariaDoPainel,
  DivisaoDoDinheiro,
  HorarioSerializado,
  PagamentosOnline,
} from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { SecaoNumerada } from "../../../componentes/SecaoNumerada";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { AREAS, resumoDaArea, type DescricaoDaArea } from "./areas";
import { SeuPerfil } from "./SeuPerfil";
import estilos from "./Configuracoes.module.css";
import { Carregando } from "../../../componentes/Carregando";

// Os grupos do índice, como no concorrente de referência: o que faz a
// agenda funcionar e o que o cliente vê.
const GRUPOS: { titulo: string; areas: AreaDeConfiguracao[] }[] = [
  { titulo: "Operação", areas: ["horarios", "regras_de_agendamento"] },
  { titulo: "Canais com clientes", areas: ["dados_do_negocio", "aparencia", "comunicacao", "notificacoes"] },
];

function plural(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

// O que vale hoje na divisão, numa frase.
function resumoDaDivisao(divisao: DivisaoDoDinheiro | null, erro?: string): string {
  if (erro === "recurso_do_plano") return "Nos planos Essencial e Completo";
  if (!divisao) return "Quanto fica com a casa e com o profissional do cliente";
  const comCasa = divisao.membros.filter((m) => m.parteDaCasa > 0).length;
  if (divisao.matriz.length === 0 && comCasa === 0) return "Quem atendeu fica com tudo";
  const partes: string[] = [];
  if (divisao.matriz.length > 0) partes.push(plural(divisao.matriz.length, "regra de cliente", "regras de cliente"));
  if (comCasa > 0) partes.push(`parte da casa em ${plural(comCasa, "profissional", "profissionais")}`);
  return partes.join(" · ");
}

// A conta da casa, numa frase. Sem ela (ainda carregando ou falhou), a
// frase geral.
function resumoDosPagamentos(daCasa: PagamentosOnline | null): string {
  if (!daCasa?.conta) return "A conta do Asaas ou da Stripe que recebe os planos assinados pela página";
  return `Conta da casa conectada · chave terminando em ${daCasa.conta.chaveFinal}`;
}

// A conta de quem está logado, pro índice do profissional.
function resumoDaSuaConta(sua: PagamentosOnline | null): string {
  if (!sua?.conta) return "A conta do Asaas ou da Stripe que recebe os planos que você vende";
  return `Sua conta conectada · chave terminando em ${sua.conta.chaveFinal}`;
}

function LinhaDoPerfil() {
  const { perfil } = usePainel();
  return (
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
  );
}

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
// que acontece se ficar assim. As áreas são da barbearia, e a API recusa
// o salvar de quem não é dono: o profissional vê só o que é dele (o
// perfil e a conta de pagamento dos planos que vende), e a recepção, que não
// vende plano, cai direto no perfil.
export function IndiceDeConfiguracoes() {
  const { perfil } = usePainel();
  if (perfil.papel === "recepcao") return <SeuPerfil comVoltar={false} />;
  if (perfil.papel === "profissional") return <IndiceDoProfissional />;
  return <IndiceDoDono />;
}

function IndiceDoProfissional() {
  const api = useApiDoPainel();
  // Só pro resumo da linha; se falhar, a linha fica com a frase geral.
  const sua = useRequisicao(() => api.barbeiro.pagamentosOnline(false), []);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina titulo="Configurações" apoio="O que é seu: o perfil e a conta que recebe os seus planos." />
      <SecaoNumerada titulo="Você">
        <ul className={estilos.lista}>
          <LinhaDoPerfil />
          <li>
            <Link href="/painel/configuracoes/pagamentos-online" className={estilos.linha}>
              <strong className={estilos.nomeDaArea}>Pagamentos online</strong>
              <span className={estilos.valor}>{resumoDaSuaConta(sua.dados)}</span>
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

function IndiceDoDono() {
  const api = useApiDoPainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);
  // Só pro resumo da linha; se falhar, a linha fica com a frase geral.
  const divisao = useRequisicao(() => api.barbeiro.divisao(), []);
  const pagamentos = useRequisicao(() => api.barbeiro.pagamentosOnline(true), []);

  const erro = barbearia.erro ?? horarios.erro;
  if (erro) return <Aviso>{erro.mensagem || "Não foi possível carregar as configurações agora."}</Aviso>;
  if (!barbearia.dados || !horarios.dados) return <Carregando />;

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

      {/* A divisão do dinheiro (caixa do dia) também fica fora da
          contagem: começar em 0 — quem atendeu fica com tudo — é uma
          escolha válida, não algo esquecido. */}
      <SecaoNumerada titulo="Dinheiro">
        <ul className={estilos.lista}>
          <li>
            <Link href="/painel/configuracoes/divisao" className={estilos.linha}>
              <strong className={estilos.nomeDaArea}>Divisão do dinheiro</strong>
              <span className={estilos.valor}>{resumoDaDivisao(divisao.dados, divisao.erro?.codigo)}</span>
              <span className={estilos.seta} aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
          <li>
            <Link href="/painel/configuracoes/pagamentos-online" className={estilos.linha}>
              <strong className={estilos.nomeDaArea}>Pagamentos online</strong>
              <span className={estilos.valor}>{resumoDosPagamentos(pagamentos.dados)}</span>
              <span className={estilos.seta} aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        </ul>
      </SecaoNumerada>

      {/* O perfil é de cada pessoa da equipe, não da barbearia: fica
          fora da contagem e sem o "Configurar". */}
      <SecaoNumerada titulo="Você">
        <ul className={estilos.lista}>
          <LinhaDoPerfil />
        </ul>
      </SecaoNumerada>
    </div>
  );
}
