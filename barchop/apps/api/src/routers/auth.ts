import { prisma } from "@barchop/database";
import { normalizarEmail, slugReservado } from "@barchop/formato";
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
      const autorizado = barbeiro?.ativo ? barbeiro : null;

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
        barbeiro: { id: autorizado.id, nome: autorizado.nome, email: autorizado.email },
        barbearia: {
          id: autorizado.barbearia.id,
          nome: autorizado.barbearia.nome,
          slug: autorizado.barbearia.slug,
        },
      });
    }
  );
}
