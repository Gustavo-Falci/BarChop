"use client";

import { useEffect, useState } from "react";
import { normalizarTelefone, TelefoneInvalido } from "@gr-barber/formato";
import type { ClienteSerializado } from "@gr-barber/types";
import { useApi } from "../api/ProvedorDaApi";
import { sessaoDoCliente } from "../sessao/armazenamento";
import type { DadosDoCliente } from "./dadosDoCliente";

const PEDE_DDD = "Informe o DDD e o número, como (11) 99999-8888";

export type Validacao =
  | { ok: true; dados: DadosDoCliente }
  // Um erro por campo, não um só: a mensagem precisa apontar o campo
  // que está errado, senão nome vazio mostra a instrução de DDD do
  // telefone, que está correto.
  | { ok: false; erros: { nome?: string; telefone?: string } };

// O telefone sai pela mesma função que a API usa. Não é só pra barrar
// cedo o 400: é por ele normalizado que a API acha o cadastro, e um
// formato diferente cria um cliente duplicado respondendo 201 igual.
export function validarDados(nome: string, telefone: string): Validacao {
  const nomeAparado = nome.trim();

  let normalizado: string | null = null;
  let erroTelefone: string | undefined;
  try {
    normalizado = normalizarTelefone(telefone);
  } catch (causa) {
    erroTelefone =
      causa instanceof TelefoneInvalido ? PEDE_DDD : "Telefone inválido";
  }
  if (!erroTelefone && !normalizado) erroTelefone = PEDE_DDD;

  const erroNome = nomeAparado ? undefined : "Informe seu nome";

  if (erroNome || erroTelefone || !normalizado) {
    return { ok: false, erros: { nome: erroNome, telefone: erroTelefone } };
  }
  return { ok: true, dados: { nome: nomeAparado, telefone: normalizado } };
}

// Três estados, e o `null` não é detalhe: enquanto a conta não foi
// apurada nada pode ser desenhado, senão a tela mostra o formulário por
// um instante e depois o troca pelo cartão de quem já estava logado.
// `false` é "não há conta utilizável" — tanto faz se é sessão ausente
// ou token que a API recusou.
export type Conta = ClienteSerializado | false | null;

// Quem é a pessoa, antes de perguntar qualquer coisa. Se tem conta
// nesta barbearia, o cadastro é a fonte — digitar de novo o que a API
// já sabe é trabalho à toa.
//
// `esquecer` é o "não é você?": sai da conta sem navegar, porque a URL
// carrega as escolhas do agendamento e trocar de rota custaria refazer
// o fluxo.
export function useContaDoCliente(slug: string): {
  conta: Conta;
  esquecer: () => void;
} {
  const api = useApi();
  const [conta, setConta] = useState<Conta>(null);

  useEffect(() => {
    if (!sessaoDoCliente(slug).ler()) {
      setConta(false);
      return;
    }

    let vivo = true;
    api.cliente
      .meuCadastro()
      .then((cliente) => {
        if (vivo) setConta(cliente);
      })
      .catch(() => {
        // Token vencido, cadastro apagado: `false`, explicitamente, e
        // não um silêncio — um erro engolido deixaria o cartão de
        // identidade meio desenhado.
        if (vivo) setConta(false);
      });

    return () => {
      vivo = false;
    };
  }, [api, slug]);

  return {
    conta,
    esquecer: () => {
      sessaoDoCliente(slug).limpar();
      setConta(false);
    },
  };
}
