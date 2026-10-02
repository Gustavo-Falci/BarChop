"use client";

import { useCallback, useEffect, useState } from "react";
import { ErroDaApi } from "@barchop/api-client";

export interface Requisicao<T> {
  dados: T | null;
  carregando: boolean;
  erro: ErroDaApi | null;
  recarregar: () => void;
}

// Cinco telas repetiriam este trio de useState. O `deps` é o mesmo
// contrato do useEffect: mudou o dia escolhido, refaz a chamada.
export function useRequisicao<T>(
  chamada: () => Promise<T>,
  deps: unknown[]
): Requisicao<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);

    // Promise.resolve envolve a chamada porque ela pode lançar de forma
    // síncrona — e aí o .catch abaixo nunca veria o erro.
    Promise.resolve()
      .then(chamada)
      .then((resposta) => {
        if (vivo) setDados(resposta);
      })
      .catch((causa: unknown) => {
        if (!vivo) return;
        // Rede caída e bug de tela não têm `codigo`; viram erro_interno
        // pra tela ter sempre um código pra ramificar.
        setErro(
          causa instanceof ErroDaApi
            ? causa
            : new ErroDaApi(0, "erro_interno", "não foi possível carregar")
        );
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });

    // A tela pode desmontar no meio (o cliente tocou em voltar): sem
    // esta trava, o setState cairia num componente que já saiu.
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tentativa]);

  return { dados, carregando, erro, recarregar };
}
