import { prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import { gerarHashSenha } from "./senha";

// A senha do suporte abre os pedidos de todas as barbearias: mais longa
// que a do dono (8).
export const SENHA_MINIMA_DO_SUPORTE = 12;

// A única porta de criação de uma conta de suporte (bloco F4). Não há
// rota: quem cria é o comando apps/api/scripts/criar-suporte.ts, rodado
// na VM por quem administra a plataforma.
export async function criarOperadorDeSuporte({
  nome,
  email,
  senha,
}: {
  nome: string;
  email: string;
  senha: string;
}) {
  const normalizado = normalizarEmail(email);
  if (!normalizado) throw new Error("e-mail do suporte inválido");
  if (senha.length < SENHA_MINIMA_DO_SUPORTE) {
    throw new Error(`a senha do suporte precisa de pelo menos ${SENHA_MINIMA_DO_SUPORTE} caracteres`);
  }

  return prisma.operadorSuporte.create({
    data: { nome: nome.trim(), email: normalizado, senhaHash: await gerarHashSenha(senha) },
    select: { id: true, nome: true, email: true },
  });
}
