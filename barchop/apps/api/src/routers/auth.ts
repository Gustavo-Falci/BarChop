import { prisma } from "@barchop/database";
import { normalizarEmail, slugReservado } from "@barchop/formato";
import { consumirCodigo, emitirCodigo } from "../lib/codigos";
import { ErroDeNegocio } from "../lib/erro-negocio";
import type { LimitesDeAuth } from "../lib/limites";
import { PADRAO_EMAIL, PADRAO_SLUG } from "../lib/padroes";
import {
  conferirSenha,
  gerarHashSenha,
  obterHashDescartavel,
} from "../lib/senha";
import type { App } from "../tipos";

const corpoSignup = {
  type: "object",
  required: ["barbearia", "barbeiro"],
  additionalProperties: false,
  properties: {
    barbearia: {
      type: "object",
      required: ["nome", "slug"],
      additionalProperties: false,
      properties: {
        nome: { type: "string", minLength: 2, maxLength: 120 },
        // o slug forma o link público que o barbeiro manda no WhatsApp
        slug: { type: "string", pattern: PADRAO_SLUG },
      },
    },
    barbeiro: {
      type: "object",
      required: ["nome", "email", "senha"],
      additionalProperties: false,
      properties: {
        nome: { type: "string", minLength: 2, maxLength: 120 },
        email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
        senha: { type: "string", minLength: 8, maxLength: 200 },
      },
    },
  },
} as const;

export function registrarRotasAuth(app: App, limites: LimitesDeAuth): void {
  app.post(
    "/auth/signup",
    { schema: { body: corpoSignup }, preHandler: limites.signupDoBarbeiro },
    async (request, reply) => {
      const { barbearia, barbeiro } = request.body;

      // Passa no pattern, mas é nome do próprio sistema: aceito, o link
      // público da barbearia ficaria sombreado por uma rota nossa. É
      // regra de domínio, não de formato — daí 422, e antes de gastar o
      // hash da senha.
      if (slugReservado(barbearia.slug)) {
        throw new ErroDeNegocio(
          "esse endereço é reservado pelo sistema",
          "slug_reservado"
        );
      }
      // `!`: o schema exige `email` como string obrigatória e não vazia
      // (PADRAO_EMAIL casa só com algo antes e depois do "@"), então
      // `normalizarEmail` nunca devolve null aqui — o `null` do retorno
      // existe pra chamador que aceita email ausente, como o de
      // clientes-me.ts.
      const email = normalizarEmail(barbeiro.email)!;
      const senhaHash = await gerarHashSenha(barbeiro.senha);

      // Transação: uma barbearia sem barbeiro seria inacessível pra
      // sempre, já que o login é por email de barbeiro.
      const criado = await prisma.$transaction(async (tx) => {
        const novaBarbearia = await tx.barbearia.create({
          data: { nome: barbearia.nome, slug: barbearia.slug },
        });

        const novoBarbeiro = await tx.barbeiro.create({
          data: {
            barbeariaId: novaBarbearia.id,
            nome: barbeiro.nome,
            email,
            senhaHash,
            // Quem cria a barbearia é o dono, e atende (default).
            papel: "dono",
          },
        });

        return { barbearia: novaBarbearia, barbeiro: novoBarbeiro };
      });

      const token = app.jwt.sign({
        tipo: "barbeiro",
        barbeiroId: criado.barbeiro.id,
        barbeariaId: criado.barbearia.id,
      });

      // Campos listados um a um, nunca spread do registro: é o que
      // garante que senhaHash não escape.
      return reply.code(201).send({
        token,
        barbeiro: {
          id: criado.barbeiro.id,
          nome: criado.barbeiro.nome,
          email: criado.barbeiro.email,
          papel: criado.barbeiro.papel,
        },
        barbearia: {
          id: criado.barbearia.id,
          nome: criado.barbearia.nome,
          slug: criado.barbearia.slug,
        },
      });
    }
  );

  const corpoLogin = {
    type: "object",
    required: ["email", "senha"],
    additionalProperties: false,
    properties: {
      email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
      senha: { type: "string", minLength: 1, maxLength: 200 },
    },
  } as const;

  app.post(
    "/auth/login",
    // Dois contadores: um por e-mail, que é o alvo de quem adivinha
    // senha, e um por IP, que é a rede de arrasto. Ver lib/limites.ts.
    { schema: { body: corpoLogin }, preHandler: limites.loginDoBarbeiro },
    async (request, reply) => {
      const { email, senha } = request.body;

      const barbeiro = await prisma.barbeiro.findUnique({
        // `!`: mesmo motivo do signup — o schema exige email não vazio.
        where: { email: normalizarEmail(email)! },
        include: { barbearia: true },
      });

      // Email inexistente e senha errada dão exatamente a mesma
      // resposta — confirmar qual dos dois falhou entregaria quais
      // emails existem na plataforma.
      //
      // Responder igual não basta: se o email não existe e a gente
      // pulasse o conferirSenha, essa resposta voltaria muito mais
      // rápido que a de senha errada, porque o scrypt é lento de
      // propósito. O relógio entregaria o que o corpo esconde. Por
      // isso o caminho sem barbeiro confere contra um hash descartável
      // — o resultado é sempre falso, mas custa o mesmo.
      //
      // Barbeiro desativado é tratado como inexistente: mesma resposta,
      // mesmo custo. `ativo` existe no schema desde a migration inicial;
      // sem esta linha, desativar alguém no futuro não tiraria o acesso
      // dele, e a falha seria silenciosa — ninguém testa o login de uma
      // conta que acabou de ser desligada.
      //
      // Membro convidado que ainda não definiu a senha também: a conta
      // existe, mas não tem senha pra conferir. Cai no hash descartável,
      // com a mesma resposta e o mesmo custo — o login não diz quem foi
      // convidado.
      const autorizado = barbeiro?.ativo && barbeiro.senhaHash ? barbeiro : null;

      const hashParaConferir =
        autorizado?.senhaHash ?? (await obterHashDescartavel());
      const senhaConfere = await conferirSenha(senha, hashParaConferir);

      if (!autorizado || !senhaConfere) {
        return reply.code(401).send({ erro: "credenciais_invalidas" });
      }

      const token = app.jwt.sign({
        tipo: "barbeiro",
        barbeiroId: autorizado.id,
        barbeariaId: autorizado.barbeariaId,
      });

      return reply.code(200).send({
        token,
        barbeiro: {
          id: autorizado.id,
          nome: autorizado.nome,
          email: autorizado.email,
          papel: autorizado.papel,
        },
        barbearia: {
          id: autorizado.barbearia.id,
          nome: autorizado.barbearia.nome,
          slug: autorizado.barbearia.slug,
        },
      });
    }
  );

  const corpoCodigo = {
    type: "object",
    required: ["email"],
    additionalProperties: false,
    properties: {
      email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
    },
  } as const;

  const corpoSenha = {
    type: "object",
    required: ["email", "codigo", "senha"],
    additionalProperties: false,
    properties: {
      email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
      codigo: { type: "string", pattern: "^[0-9]{6}$" },
      senha: { type: "string", minLength: 8, maxLength: 200 },
    },
  } as const;

  // Esqueci a senha do barbeiro: o código vai pro e-mail da conta.
  //
  // A resposta é a mesma tendo ou não conta, e o custo também: o código
  // é emitido (e guardado) nos dois casos, e só o envio depende de a
  // conta existir. O envio não é aguardado — com o provedor real ele é
  // uma ida à rede, e esperar por ela só no caso "tem conta" deixaria o
  // relógio dizer o que o corpo esconde. Um código emitido pra e-mail
  // sem conta nunca chega a ninguém, e a confirmação recusa do mesmo
  // jeito.
  app.post(
    "/auth/codigo",
    { schema: { body: corpoCodigo }, preHandler: limites.codigoDoBarbeiro },
    async (request, reply) => {
      // `!`: o schema exige e-mail não vazio, como no login.
      const email = normalizarEmail(request.body.email)!;

      const barbeiro = await prisma.barbeiro.findUnique({
        where: { email },
        select: { ativo: true },
      });

      const codigo = await emitirCodigo({
        finalidade: "senha_barbeiro",
        destino: email,
        barbeariaId: null,
      });

      if (barbeiro?.ativo) {
        void app.canal
          .enviar({
            para: email,
            assunto: "Seu código para redefinir a senha do BarChop",
            texto:
              `BarChop: seu código pra redefinir a senha do painel é ${codigo}. ` +
              "Vale 10 minutos. Se não foi você que pediu, ignore este e-mail.",
          })
          .catch((erro: unknown) =>
            request.log.error({ erro }, "falha ao enviar o código do barbeiro")
          );
      }

      return reply.code(202).send({ enviado: true });
    }
  );

  app.post(
    "/auth/senha",
    { schema: { body: corpoSenha }, preHandler: limites.senhaDoBarbeiro },
    async (request, reply) => {
      const { codigo, senha } = request.body;
      const email = normalizarEmail(request.body.email)!;

      // O código antes de tudo, como no do cliente: sem prova de posse
      // do e-mail, nada sobre a conta é lido nem respondido.
      const provado = await consumirCodigo(
        { finalidade: "senha_barbeiro", destino: email, barbeariaId: null },
        codigo
      );
      const barbeiro = provado
        ? await prisma.barbeiro.findUnique({ where: { email } })
        : null;

      // Conta inexistente ou desativada responde igual a código errado:
      // com código válido em mãos, só o dono da caixa chega até aqui.
      if (!barbeiro?.ativo) {
        throw new ErroDeNegocio("código inválido ou vencido", "codigo_invalido");
      }

      const atualizado = await prisma.barbeiro.update({
        where: { id: barbeiro.id },
        // O carimbo derruba as sessões abertas (plugins/auth.ts).
        data: {
          senhaHash: await gerarHashSenha(senha),
          senhaAlteradaEm: new Date(),
        },
        include: { barbearia: true },
      });

      const token = app.jwt.sign({
        tipo: "barbeiro",
        barbeiroId: atualizado.id,
        barbeariaId: atualizado.barbeariaId,
      });

      // O mesmo formato do login: a tela grava a sessão do mesmo jeito.
      return reply.code(200).send({
        token,
        barbeiro: { id: atualizado.id, nome: atualizado.nome, email: atualizado.email },
        barbearia: {
          id: atualizado.barbearia.id,
          nome: atualizado.barbearia.nome,
          slug: atualizado.barbearia.slug,
        },
      });
    }
  );
}
