# @barchop/database

ORM: **Prisma**. `prisma/schema.prisma` é a fonte da verdade dos
modelos; `schema.sql` na raiz deste pacote fica só como referência
legível — não é mais o que roda.

## Setup

```bash
cp .env.example .env   # ajuste DATABASE_URL pro seu Postgres
pnpm --filter @barchop/database generate
pnpm --filter @barchop/database migrate:dev
```

## A pegadinha da EXCLUDE constraint

O Prisma não sabe representar `EXCLUDE USING gist` nem colunas
`GENERATED ALWAYS AS ... STORED` no schema declarativo — são
recursos avançados demais do PostgreSQL. A migration inicial em
`prisma/migrations/20260829120000_init/migration.sql` já tem isso
adicionado à mão no final do arquivo, claramente marcado.

**Ao criar novas migrations depois desta**, se você rodar
`prisma migrate dev` normalmente ele vai gerar SQL baseado só no
`schema.prisma` — o que não inclui a constraint. Ela já existe no
banco desde a migration inicial, então isso não é problema pra
migrations futuras que não mexem na tabela `agendamento`. Se
precisar alterar essa tabela, gere a migration com
`--create-only`, confira se a constraint não foi afetada, e edite
à mão se precisar.

## Usando o client

```ts
import { prisma } from "@barchop/database";

const servicos = await prisma.servico.findMany({
  where: { barbeariaId, ativo: true },
});
```

Os tipos (`Barbearia`, `Agendamento`, etc.) vêm do
`@prisma/client` gerado — não precisam mais ser mantidos à mão em
`@barchop/types` (esse pacote agora guarda só os DTOs de
API que não são um espelho direto de tabela).
