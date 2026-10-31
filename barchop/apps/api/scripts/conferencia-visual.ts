// Sobe a API no banco de TESTE com uma barbearia de exemplo (equipe,
// serviços, clientes, planos e agendamentos de hoje), pra
// conferir as telas do painel no navegador (redesenho do celular).
//
// Uso (de barchop/):
//   pnpm --filter @barchop/api exec tsx scripts/conferencia-visual.ts
// Depois, `pnpm --filter web dev` e, no navegador em localhost:3000,
// gravar no localStorage a chave `sessao.barbeiro` com o token impresso.
//
// O banco é TRUNCADO a cada execução. Por isso o script lê o .env.test
// por conta própria e recusa qualquer banco que não termine em `_test`:
// o .env.test começa com BOM, o `node --env-file` não lê a primeira
// linha dele e cairia no DATABASE_URL do .env, o banco de dev (31/10).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

function lerEnv(arquivo: string): Record<string, string> {
  const caminho = join(__dirname, "..", arquivo);
  if (!existsSync(caminho)) return {};
  return parse(readFileSync(caminho, "utf8").replace(/^\uFEFF/, ""));
}

function nomeDoBanco(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    // A URL nunca é impressa: ela leva a senha do banco.
    return "";
  }
}

async function main() {
  const ambiente = { ...lerEnv(".env"), ...lerEnv(".env.test") };
  const banco = nomeDoBanco(ambiente.DATABASE_URL ?? "");
  if (!banco.endsWith("_test")) {
    throw new Error(`recusado: o banco precisa terminar em _test (encontrado: "${banco || "vazio"}")`);
  }
  Object.assign(process.env, ambiente, { NODE_ENV: "test" });

  // Só depois do ambiente pronto: o Prisma lê o DATABASE_URL ao carregar.
  const { prisma } = await import("@barchop/database");
  const { buildApp } = await import("../src/app");
  const { limparBanco } = await import("../tests/helpers/limpar-banco");
  const { comCodigo } = await import("../tests/helpers/barbearia");
  const { gerarHashSenha } = await import("../src/lib/senha");
  const { normalizarTelefoneObrigatorio } = await import("../src/lib/telefone");
  const { agoraNaBarbearia, dataParaDate, horaParaDate, somarMinutos } = await import("../src/lib/horas");

  await limparBanco();
  const app = buildApp({ logger: false });
  await app.ready();

  const cadastro = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: await comCodigo({
      barbearia: { nome: "Barbearia Teste", slug: "barbearia-teste" },
      barbeiro: { nome: "Gustavo Falci", email: "gustavo@exemplo.com", senha: "senha-forte-123" },
    }),
  });
  if (cadastro.statusCode !== 201) {
    throw new Error(`cadastro falhou: ${cadastro.statusCode} ${cadastro.body}`);
  }
  const { token, barbearia, barbeiro } = cadastro.json();

  const membro = await prisma.barbeiro.create({
    data: {
      barbeariaId: barbearia.id,
      nome: "TESTE",
      email: "teste@exemplo.com",
      telefone: normalizarTelefoneObrigatorio("(11) 90000-0002"),
      senhaHash: await gerarHashSenha("senha-forte-123"),
      papel: "profissional",
      atende: true,
    },
  });

  const corte = await prisma.servico.create({
    data: { barbeariaId: barbearia.id, nome: "Corte social", duracaoMinutos: 30, preco: 30, categoria: "cabelo" },
  });

  const clientes = [];
  for (const [nome, telefone] of [
    ["Gustavo", "(11) 90000-0001"],
    ["Teste", "(11) 90000-0002"],
  ] as const) {
    clientes.push(
      await prisma.cliente.create({
        data: { barbeariaId: barbearia.id, nome, telefone: normalizarTelefoneObrigatorio(telefone) },
      })
    );
  }

  // Um serviço caro, pro previsto do Hoje chegar aos quatro dígitos: é o
  // pior caso do número na coluna estreita do celular.
  const noivo = await prisma.servico.create({
    data: { barbeariaId: barbearia.id, nome: "Dia do noivo", duracaoMinutos: 30, preco: 450, categoria: "cabelo" },
  });

  // Agendamentos de hoje, no fuso da barbearia (o mesmo "hoje" da API):
  // um de manhã, que já passou, e três à noite, pros "ainda hoje".
  const hoje = agoraNaBarbearia().data;
  const agenda: [string, typeof corte, typeof membro | null, number][] = [
    ["09:00", corte, null, 0],
    ["21:00", noivo, null, 0],
    ["21:30", noivo, membro, 1],
    ["23:00", noivo, null, 1],
  ];
  for (const [hora, servico, quem, cliente] of agenda) {
    await prisma.agendamento.create({
      data: {
        barbeariaId: barbearia.id,
        barbeiroId: quem?.id ?? barbeiro.id,
        clienteId: clientes[cliente]!.id,
        data: dataParaDate(hoje),
        horaInicio: horaParaDate(hora),
        horaFim: horaParaDate(somarMinutos(hora, servico.duracaoMinutos)),
        servicos: {
          create: { servicoId: servico.id, precoNoMomento: servico.preco, duracaoNoMomento: servico.duracaoMinutos },
        },
      },
    });
  }

  // Os seis planos dos prints de 31/10, todos desativados, em três vendedores.
  const planos: [string, number, string | null, number | null][] = [
    ["Corte ilimitado", 9999, null, null],
    ["Cortes ilimitados", 12000, null, null],
    ["Corte teste", 5000, null, 3],
    ["Corte ilimitados", 10000, membro.id, null],
    ["Teste do webhook", 1000, barbeiro.id, 1],
    ["TESTE", 5000, barbeiro.id, 3],
  ];
  for (const [ordem, [nome, precoCentavos, vendedorId, usos]] of planos.entries()) {
    await prisma.planoDeAssinatura.create({
      data: {
        barbeariaId: barbearia.id,
        vendedorId,
        // Plano da casa paga um fixo por atendimento a quem atende; o de
        // um profissional, não (CHECK plano_de_assinatura_fixo_check).
        fixoPorAtendimentoCentavos: vendedorId ? null : 1500,
        nome,
        ciclo: "mensal",
        precoCentavos,
        ativo: false,
        ordem,
        servicos: { create: { servicoId: corte.id, usosPorCiclo: usos } },
      },
    });
  }

  await app.listen({ port: 3333, host: "0.0.0.0" });
  console.log(`API de conferência em http://localhost:3333 (banco ${banco})`);
  console.log(`slug: ${barbearia.slug}`);
  console.log(`token do dono (localStorage "sessao.barbeiro"): ${token}`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
