"use client";

import { ProvedorDoPainel } from "../../../../src/painel/ProvedorDoPainel";
import { CadastroDoDono } from "../../../../src/telas/painel/CadastroDoDono";

// Fora do subgrupo (guardado), como o /painel/entrar: quem chega aqui
// ainda não tem sessão, e a guarda o mandaria pro login.
export default function Pagina() {
  return (
    <ProvedorDoPainel>
      <CadastroDoDono />
    </ProvedorDoPainel>
  );
}
