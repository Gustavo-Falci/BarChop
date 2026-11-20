import { prisma } from "@barchop/database";
import type { CanalDeMensagem } from "./canal";

// O aviso de que o e-mail ou o telefone de uma conta de cliente mudou
// (auditoria de 15/11, SEC-013). Os dois são o login e o destino do
// código de redefinir a senha: trocar um deles é trocar quem consegue
// entrar. O aviso vai pro e-mail que estava na conta ANTES da troca —
// é o único endereço que ainda é, com certeza, do dono dela.
//
// O valor novo não vai no texto: quem recebe precisa saber que mudou,
// não pra onde — e o endereço novo pode ser de outra pessoa.

export type ContatoTrocado = "email" | "telefone";

interface Aviso {
  canal: CanalDeMensagem;
  log: { warn(objeto: object, mensagem: string): void };
  barbeariaId: string;
  // O e-mail de antes da troca. Sem ele não há pra onde avisar.
  emailAnterior: string | null;
  trocados: ContatoTrocado[];
}

const NOMES: Record<ContatoTrocado, string> = { email: "e-mail", telefone: "telefone" };

// Nunca lança: a troca já foi gravada, e um provedor de e-mail fora do
// ar não pode virar erro pra quem editou o cadastro. A falha vai pro log.
export async function avisarTrocaDeContato(aviso: Aviso): Promise<void> {
  const { canal, log, barbeariaId, emailAnterior, trocados } = aviso;
  if (!emailAnterior || trocados.length === 0) return;
  // No piloto todo canal entrega e-mail; o teste fica pra quando um
  // ambiente subir só com o WhatsApp.
  if (!canal.destinos.includes("email")) return;

  try {
    const barbearia = await prisma.barbearia.findUnique({
      where: { id: barbeariaId },
      select: { nome: true },
    });
    const oQue = trocados.map((t) => NOMES[t]).join(" e o ");
    const onde = barbearia ? ` na ${barbearia.nome}` : "";

    await canal.enviar({
      para: emailAnterior,
      assunto: "Os dados de acesso da sua conta foram alterados",
      texto:
        `O ${oQue} da sua conta${onde} foi alterado. ` +
        "Se foi você, não precisa fazer nada. Se não foi, fale com a barbearia.",
    });
  } catch (erro) {
    log.warn({ erro }, "não foi possível avisar a troca de contato do cliente");
  }
}
