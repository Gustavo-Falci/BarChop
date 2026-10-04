"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Secao } from "../../componentes/Secao";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./ServicosDoMembro.module.css";

// Os serviços que o membro faz. Quem não faz um serviço não aparece pra
// ele na agenda nem no agendamento online. Serviço novo entra pra equipe
// inteira; daqui o dono tira de quem não faz.
export function ServicosDoMembro({ membroId }: { membroId: string }) {
  const api = useApiDoPainel();
  const catalogo = useRequisicao(() => api.barbeiro.servicos(), []);
  const feitos = useRequisicao(() => api.barbeiro.servicosDoMembro(membroId), [membroId]);

  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado durante a renderização (ver CadastroDeServico).
  const [sincronizados, setSincronizados] = useState<string[] | null>(null);
  if (feitos.dados && feitos.dados !== sincronizados) {
    setSincronizados(feitos.dados);
    setMarcados(new Set(feitos.dados));
  }

  const erro = catalogo.erro ?? feitos.erro;
  if (erro) {
    return <Aviso>{erro.mensagem || "Não foi possível carregar os serviços agora."}</Aviso>;
  }

  function alternar(id: string) {
    setConfirmacao(undefined);
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function salvar() {
    setAviso(undefined);
    setConfirmacao(undefined);
    setSalvando(true);
    try {
      // Na ordem do catálogo, não na dos cliques: a lista é a mesma
      // coisa vista do mesmo jeito.
      const ids = (catalogo.dados ?? []).map((s) => s.id).filter((id) => marcados.has(id));
      const gravados = await api.barbeiro.salvarServicosDoMembro(membroId, ids);
      setSincronizados(gravados);
      setMarcados(new Set(gravados));
      setConfirmacao("Serviços salvos.");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar os serviços agora.");
    } finally {
      setSalvando(false);
    }
  }

  const carregando = !catalogo.dados || !feitos.dados;

  return (
    <Secao
      titulo="Serviços que faz"
      descricao="Só aparecem pra esta pessoa, na agenda e no agendamento online, os serviços marcados."
      acao={
        <Botao onClick={salvar} carregando={salvando} disabled={carregando}>
          Salvar serviços
        </Botao>
      }
    >
      {carregando ? (
        <p>Carregando…</p>
      ) : catalogo.dados!.length === 0 ? (
        <p className={estilos.vazio}>Nenhum serviço cadastrado ainda.</p>
      ) : (
        <ul className={estilos.lista}>
          {catalogo.dados!.map((servico) => (
            <li key={servico.id}>
              <label className={estilos.opcao}>
                <input
                  type="checkbox"
                  checked={marcados.has(servico.id)}
                  onChange={() => alternar(servico.id)}
                />
                {servico.nome}
                {/* Dentro do label de propósito: "Platinado (inativo)" é
                    o que se quer ouvir antes de marcar. */}
                {servico.ativo ? null : <span className={estilos.inativo}> (inativo)</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {confirmacao ? <Aviso tom="sucesso">{confirmacao}</Aviso> : null}
    </Secao>
  );
}
