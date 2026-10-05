import { prisma } from "@barchop/database";
import { normalizarEmail, slugReservado } from "@barchop/formato";
import { consumirCodigo, emitirCodigo } from "../lib/codigos";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { garantirSlugLivre } from "../lib/slug";
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
  required: ["barbearia", "barbeiro", "codigo"],
  additionalProperties: false,
  properties: {
    // O código que chegou no e-mail do dono (POST /auth/cadastro/codigo):
    // a barbearia só nasce com o e-mail provado (Onda 1, F3).
    codigo: { type: "string", pattern: "^[0-9]{6}$" },
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
      //
      // O código é consumido aqui dentro: um 409 do slug desfaz tudo e o
      // código volta a valer, pra o dono só trocar o link. Código que não
      // confere NÃO lança dentro da transação — devolve null, a transação
      // grava a tentativa gasta, e o erro sai depois.
      const criado = await prisma.$transaction(async (tx) => {
        const provado = await consumirCodigo(
          { finalidade: "cadastro_dono", destino: email, barbeariaId: null },
          request.body.codigo,
          new Date(),
          tx
        );
        if (!provado) return null;

        // O link é único pra sempre (F4): um nome que outra barbearia já
        // teve continua dela. Lança aqui dentro de propósito — o rollback
        // devolve o código, e o dono só escolhe outro link.
        await garantirSlugLivre(tx, barbearia.slug, null);
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

      if (!criado) {
        throw new ErroDeNegocio("código inválido ou vencido", "codigo_invalido");
      }

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
  // O código do cadastro do dono. Responde igual com o e-mail livre ou
  // tomado: é o que fecha a sondagem que o 409 do signup permitia. Livre
  // recebe o código; tomado (conta ou convite pendente) recebe um aviso
  // pra entrar ou recuperar a senha — e código nenhum, então nenhum
  // código digitado cadastra de novo um e-mail que já existe.
  app.post(
    "/auth/cadastro/codigo",
    { schema: { body: corpoCodigo }, preHandler: limites.codigoDoCadastro },
    async (request, reply) => {
      const email = normalizarEmail(request.body.email)!;

      const existente = await prisma.barbeiro.findUnique({
        where: { email },
        select: { id: true },
      });

      const mensagem = existente
        ? {
            para: email,
            assunto: "Você já tem uma conta no BarChop",
            texto:
              "Alguém tentou criar uma barbearia no BarChop com este e-mail, mas você já tem uma conta. " +
              "Entre pelo painel ou use \"Esqueci a senha\". Se não foi você, ignore este e-mail.",
          }
        : {
            para: email,
            assunto: "Seu código para criar a barbearia no BarChop",
            texto:
              `BarChop: seu código pra criar a barbearia é ${await emitirCodigo({
                finalidade: "cadastro_dono",
                destino: email,
                barbeariaId: null,
              })}. Vale 10 minutos. Se não foi você que pediu, ignore este e-mail.`,
          };

      // Sem esperar o envio: o tempo de resposta não pode dizer qual dos
      // dois e-mails saiu.
      void app.canal
        .enviar(mensagem)
        .catch((erro: unknown) =>
          request.log.error({ erro }, "falha ao enviar o e-mail do cadastro")
        );

      return reply.code(202).send({ enviado: true });
    }
  );

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

  // O membro convidado pela equipe define a primeira senha e já entra.
  // Mesmo desenho do /auth/senha — código antes de tudo, toda falha com
  // a mesma resposta —, com uma guarda a mais: só vale pra quem ainda
  // não tem senha. O código do convite vive 7 dias; aceitar que ele
  // trocasse uma senha existente faria dele um esqueci-a-senha folgado.
  app.post(
    "/auth/convite/aceitar",
    { schema: { body: corpoSenha }, preHandler: limites.conviteDoBarbeiro },
    async (request, reply) => {
      const { codigo, senha } = request.body;
      const email = normalizarEmail(request.body.email)!;

      const provado = await consumirCodigo(
        { finalidade: "convite_profissional", destino: email, barbeariaId: null },
        codigo
      );
      const membro = provado
        ? await prisma.barbeiro.findUnique({ where: { email } })
        : null;

      if (!membro?.ativo || membro.senhaHash !== null) {
        throw new ErroDeNegocio("código inválido ou vencido", "codigo_invalido");
      }

      // `senhaHash: null` no where: dois aceites simultâneos com códigos
      // diferentes (o dono reenviou) não podem, os dois, definir a senha.
      const definido = await prisma.barbeiro.updateMany({
        where: { id: membro.id, senhaHash: null },
        data: { senhaHash: await gerarHashSenha(senha), senhaAlteradaEm: new Date() },
      });
      if (definido.count !== 1) {
        throw new ErroDeNegocio("código inválido ou vencido", "codigo_invalido");
      }

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { id: membro.barbeariaId },
      });

      const token = app.jwt.sign({
        tipo: "barbeiro",
        barbeiroId: membro.id,
        barbeariaId: membro.barbeariaId,
      });

      // O formato do login, com o papel: o painel decide o que mostrar
      // a partir dele desde a primeira tela.
      return reply.code(200).send({
        token,
        barbeiro: { id: membro.id, nome: membro.nome, email: membro.email, papel: membro.papel },
        barbearia: { id: barbearia.id, nome: barbearia.nome, slug: barbearia.slug },
      });
    }
  );
}
