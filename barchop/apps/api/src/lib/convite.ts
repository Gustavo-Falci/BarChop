import type { FastifyRequest } from "fastify";
import { prisma } from "@barchop/database";
import type { App } from "../tipos";
import { emitirCodigo } from "./codigos";

// O convite pra equipe (Onda 1, A4): o código de 7 dias por e-mail. Sai
// ao incluir, no reenvio e, com o plano pago, quando o membro que
// aguardava pagamento é liberado (plano profissional-novo-pago).

// O envio não é aguardado, como no /auth/codigo: uma falha do provedor
// fica no log, e o dono reenvia pela própria equipe.
export async function enviarConvite(
  app: App,
  request: FastifyRequest,
  membro: { email: string; barbeariaId: string }
): Promise<void> {
  const barbearia = await prisma.barbearia.findUniqueOrThrow({
    where: { id: membro.barbeariaId },
    select: { nome: true },
  });
  // barbeariaId nulo, como no esqueci-a-senha: o e-mail do membro é
  // único na plataforma, e o aceite não sabe a barbearia antes de provar
  // o código.
  const codigo = await emitirCodigo({
    finalidade: "convite_profissional",
    destino: membro.email,
    barbeariaId: null,
  });

  // O link só sai com URL_DO_PAINEL configurada: sem ela não há
  // endereço certo a apontar, e um link pra lugar nenhum é pior que o
  // código sozinho. O e-mail vai na query pra a tela já chegar com ele.
  const painel = process.env.URL_DO_PAINEL?.replace(/\/+$/, "");
  const link = painel
    ? ` Abra ${painel}/painel/convite?email=${encodeURIComponent(membro.email)} para começar.`
    : "";

  void app.canal
    .enviar({
      para: membro.email,
      assunto: `Convite para a equipe da ${barbearia.nome} no BarChop`,
      texto:
        `${barbearia.nome} convidou você para a equipe no BarChop. ` +
        `Seu código de convite é ${codigo}. Vale 7 dias: use-o para ` +
        `definir sua senha e entrar no painel.${link}`,
    })
    .catch((erro: unknown) => request.log.error({ erro }, "falha ao enviar o convite"));
}
