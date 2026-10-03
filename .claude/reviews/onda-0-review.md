# Review: branch `onda-0` — Onda 0, Casa arrumada

**Reviewed**: 2026-10-02
**Branch**: onda-0 → main (sem PR ainda)
**Decision**: APPROVE com comentários (o único HIGH achado foi corrigido na própria branch)

## Summary
Diff de 56 arquivos (+2535/−310), metade docs e testes. Rotas novas seguem o padrão da API (schema `as const`, `ErroDeNegocio` com código estável, anti-enumeração por corpo e por relógio). Um bug de UX real foi achado e corrigido com RED/GREEN; três pontos ficam registrados como dívida no roteiro.

## Findings

### CRITICAL
None.

### HIGH
- **Corrigido** — `apps/web/src/telas/painel/ConfiguracoesDaBarbearia.tsx`: "Trocar link" chamava `barbearia.recarregar()`, que resincroniza o formulário inteiro e apagava edições não salvas (nome, endereço, sobre). RED `b102a97`, fix `02576fc`.

### MEDIUM
- `apps/api/src/lib/limites.ts` (`codigoDoCliente`, `codigoDoBarbeiro`): o limite de 3 pedidos por destino em 15 min pode ser gasto por um terceiro que conheça o telefone/e-mail, travando a recuperação legítima pela janela. Padrão já existente no cliente; registrado como dívida.
- Trocar o slug derruba a sessão dos clientes no navegador: a chave é `sessao.cliente.<slug>` (`apps/web/src/sessao/armazenamento.ts`). Registrado como dívida, junto do redirect do slug antigo (Onda 1).

### LOW
- `POST /barbearias/:slug/agendamentos` com slug inexistente E data passada responde 422 `horario_passado`, não 404 — o `garantirFuturo` roda antes do `findUniqueOrThrow`. Não vaza nada; só a precedência do erro.
- O monorepo não tem lint configurado: `pnpm lint` só dispara o build do `@barchop/database`. Registrado como dívida.

## Validation Results

| Check | Result |
|---|---|
| Type check (`pnpm type-check`) | Pass |
| Lint (`pnpm lint`) | Skipped — nenhum pacote tem script de lint |
| Tests | Pass — API 367, web 458, api-client 54, formato 19 |
| Build | Skipped |

## Files Reviewed
Fonte: `apps/api/src/{lib/agendamento-alteravel,lib/disponibilidade,lib/limites,lib/padroes,plugins/auth,routers/agendamentos,routers/auth,routers/auth-cliente,routers/barbearias,routers/clientes-me,routers/disponibilidade,routers/servicos}.ts` (M); `packages/formato/src/slug.ts` (A), `index.ts` (M); `packages/api-client/src/{barbeiro,falso,index}.ts` (M); `packages/database/prisma/schema.prisma` (M) + migration `20261002120000_senha_alterada_em` (A); `apps/web/src/telas/painel/{EntrarNoPainel,ConfiguracoesDaBarbearia}.tsx` (M), `RecuperarSenhaDoPainel.tsx` (A); `apps/web/src/painel/SessaoDoPainel.tsx` (M). Mais testes e docs.
