"use client";

import type { ReactNode } from "react";
import { Aviso } from "../componentes/Aviso";
import { usePainel } from "./SessaoDoPainel";

// Guarda das telas que só o dono usa (Equipe, cadastro de serviço). A
// barra já esconde o link; isto cobre a URL digitada ou salva, que
// abriria a tela inteira só pra devolver 403 no primeiro clique. Quem
// barra de verdade continua sendo a API.
//
// Fica na página da rota, e não dentro da tela: a tela não monta, então
// nem chega a pedir os dados que o papel não deveria precisar.
export function SoDoDono({ children }: { children: ReactNode }) {
  const { perfil } = usePainel();

  if (perfil.papel !== "dono") {
    return <Aviso>Só o dono da barbearia acessa esta tela.</Aviso>;
  }

  return <>{children}</>;
}
