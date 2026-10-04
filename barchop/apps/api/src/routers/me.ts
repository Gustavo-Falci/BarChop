import { prisma } from "@barchop/database";
import { normalizarTelefone } from "../lib/telefone";
import { PADRAO_TELEFONE } from "../lib/padroes";
import type { App } from "../tipos";

// Formato de resposta das duas rotas. Campos listados um a um, nunca
// spread do registro: é o que garante que senhaHash não escape.
function respostaBarbeiro(barbeiro: {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  barbeariaId: string;
  papel: string;
  atende: boolean;
}) {
  return {
    id: barbeiro.id,
    nome: barbeiro.nome,
    email: barbeiro.email,
    telefone: barbeiro.telefone,
    barbeariaId: barbeiro.barbeariaId,
    // O painel esconde o que o papel não pode; quem barra é a API.
    papel: barbeiro.papel,
    atende: barbeiro.atende,
  };
}

// A tela de Configurações edita nome e telefone. Email, senha e
// barbearia ficam fora: trocar email mexe na chave de login, e
// barbeariaId por aqui seria trocar de barbearia no meio do caminho.
// `additionalProperties: false` é o que transforma "fora da lista" em
// 400 em vez de silêncio.
const corpoPatchMe = {
  type: "object",
  additionalProperties: false,
  // Corpo vazio seria um UPDATE sem efeito respondendo 200 — melhor
  // dizer que a requisição não faz sentido.
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    telefone: {
      type: ["string", "null"],
      pattern: PADRAO_TELEFONE,
      maxLength: 20,
    },
  },
} as const;

// Sem `onRequest` aqui: quem autentica é o escopo das rotas protegidas,
// no app.ts. Ver o comentário lá.
export function registrarRotasMe(app: App): void {
  app.get("/me", async (request) => {
    // O id vem do token, nunca da URL ou do corpo — é o que impede um
    // barbeiro de ler o perfil de outro.
    const barbeiro = await prisma.barbeiro.findUniqueOrThrow({
      where: { id: request.user.barbeiroId },
    });

    return respostaBarbeiro(barbeiro);
  });

  app.patch("/me", { schema: { body: corpoPatchMe } }, async (request) => {
    // `request.body` já passou pelo schema com additionalProperties:
    // false, então só carrega os campos editáveis — repassá-lo direto
    // pro `data` não abre caminho pra campo inesperado.
    // `telefone` sai do corpo pra ser normalizado; o resto vai direto,
    // porque o additionalProperties: false já garantiu que só há campo
    // editável ali.
    const { telefone, ...resto } = request.body;

    const barbeiro = await prisma.barbeiro.update({
      where: { id: request.user.barbeiroId },
      data: {
        ...resto,
        ...(telefone !== undefined
          ? { telefone: normalizarTelefone(telefone) }
          : {}),
      },
    });

    return respostaBarbeiro(barbeiro);
  });
}
