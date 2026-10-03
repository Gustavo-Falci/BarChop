"use client";

import { SoDoDono } from "../../../../../../src/painel/SoDoDono";
import { CadastroDeServico } from "../../../../../../src/telas/painel/CadastroDeServico";

// Cadastrar e editar serviço é do dono; a lista continua aberta a todos.
export default function Pagina() {
  return (
    <SoDoDono>
      <CadastroDeServico />
    </SoDoDono>
  );
}
