"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarTelefoneObrigatorio, TelefoneInvalido } from "@barchop/formato";
import type { ClienteSerializado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./BuscaDeCliente.module.css";

export function BuscaDeCliente({
  escolhido,
  aoEscolher,
}: {
  escolhido: ClienteSerializado | null;
  aoEscolher: (cliente: ClienteSerializado) => void;
}) {
  const api = useApiDoPainel();
  const [busca, setBusca] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  // O quarto caminho de salvamento do painel, ao lado dos três save
  // buttons de Configurações (8d044fa) — este ficou de fora daquele
  // fix por viver embutido em NovoAgendamento, não numa tela própria.
  // Sem a trava, um duplo clique dispara `criarCliente` duas vezes; a
  // segunda volta 409 e a tela culparia o barbeiro por um duplicado que
  // ela mesma acabou de criar.
  const [salvando, setSalvando] = useState(false);

  const clientes = useRequisicao(() => api.barbeiro.clientes(busca), [busca]);

  // O cliente recém-escolhido (criado agora, ou achado depois de um
  // telefone repetido) entra na lista mostrada mesmo que a busca atual
  // não o traga de volta: recarregar a requisição não bastaria, porque
  // a busca poderia estar filtrando por outra coisa e o cadastro que
  // acabou de acontecer sumiria da tela igual.
  // Só a primeira página: quem procura alguém aqui digita o nome, não
  // rola uma lista de 260. O `total` e o `proximoCursor` da resposta não
  // interessam a esta tela.
  const listaBase = clientes.dados?.clientes ?? [];
  const lista =
    escolhido && !listaBase.some((cliente) => cliente.id === escolhido.id)
      ? [escolhido, ...listaBase]
      : listaBase;

  async function cadastrar() {
    // Trava explícita, e não só o `carregando` no botão: um `disabled`
    // que só existe depois de um re-render deixa a discriminação
    // depender de quando o React agenda esse render. Isto barra o
    // segundo clique não importa o timing.
    if (salvando) return;

    setAviso(undefined);
    setErroTelefone(undefined);

    let numero: string;
    try {
      numero = normalizarTelefoneObrigatorio(telefone);
    } catch (causa) {
      setErroTelefone(
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido"
      );
      return;
    }

    setSalvando(true);
    try {
      const criado = await api.barbeiro.criarCliente({ nome: nome.trim(), telefone: numero });
      setCadastrando(false);
      setNome("");
      setTelefone("");
      aoEscolher(criado);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "conflito") {
        // Telefone repetido é o caso comum do walk-in, não o raro: quem
        // chega já existe, criado pelo upsert do agendamento público.
        // Um erro seco aqui seria um beco.
        setAviso("Esse telefone já tem cadastro — ele está na lista abaixo.");
        setBusca(numero);
        setCadastrando(false);
      } else {
        setAviso(erro.mensagem || "Não foi possível cadastrar agora.");
      }
    }
    setSalvando(false);
  }

  return (
    <>
      {/* "Buscar cliente", e não "Buscar por nome ou telefone": esse
          rótulo mais longo contém as duas palavras que também nomeiam
          os campos do cadastro embutido ("Nome", "Telefone"), e
          getByLabelText(/nome/i) ou /telefone/i acharia dois elementos
          ao mesmo tempo com os dois blocos abertos juntos. */}
      <Campo rotulo="Buscar cliente" valor={busca} onChange={setBusca} />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <ul className={estilos.lista}>
        {lista.map((cliente) => (
          <li key={cliente.id}>
            <button
              type="button"
              aria-current={escolhido?.id === cliente.id ? "true" : undefined}
              onClick={() => aoEscolher(cliente)}
            >
              {cliente.nome} · {cliente.telefone}
            </button>
          </li>
        ))}
      </ul>

      {cadastrando ? (
        <div className={estilos.cadastro}>
          <Campo rotulo="Nome" valor={nome} onChange={setNome} />
          <Campo
            rotulo="Telefone"
            formato="telefone"
            valor={telefone}
            onChange={(proximo) => {
              setTelefone(proximo);
              setErroTelefone(undefined);
            }}
            erro={erroTelefone}
          />
          <Botao onClick={cadastrar} carregando={salvando}>
            Cadastrar
          </Botao>
        </div>
      ) : (
        <Botao variante="contorno" onClick={() => setCadastrando(true)}>
          + Cadastrar novo
        </Botao>
      )}
    </>
  );
}
