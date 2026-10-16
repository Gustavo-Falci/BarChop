# Plan: Caixa do dia e comissões

**Source PRD**: `.claude/prds/onda-2-dinheiro.prd.md`
**Selected Milestone**: 2 — Caixa do dia e comissões
**Complexity**: Large (8 PRs, 1 migração no PR 2)

## Summary
Ao concluir um atendimento, o painel registra quanto foi pago, a forma de pagamento, o desconto, a gorjeta e quem recebeu o dinheiro. Na mesma hora, o pagamento é dividido entre quem atendeu, o profissional de quem o cliente é e a casa, pelas regras da barbearia. No fim do dia, a tela Caixa mostra, por profissional, quanto recebeu, quanto lhe cabe e quanto deve repassar a quem. Quando o dono fecha o dia, esse acerto fica gravado. Tudo isso é recurso dos planos Essencial e Completo (`caixa` em `planos.ts`).

## Decisões do dono (16/10, antes do plano)
- **Divisão = matriz + parte da casa.**
  - A matriz vale por par "cliente de A, atendido por B" (A ≠ B) e diz quanto % vai para A. A regra da GR cabe: cliente do dono atendido pelo parceiro → 60% para o dono; cliente do parceiro atendido pelo dono → 0%.
  - A parte da casa é um % por profissional, que fica com a barbearia de tudo o que ele atende.
  - As duas começam em 0, ou seja, quem atendeu fica com tudo.
- **Fechar o dia grava e trava.** O acerto fica gravado (vira o histórico do marco 4 e a métrica "fechou ≥ 5 dias/semana"). Num dia fechado, mexer em pagamento pede reabrir, e só o dono reabre.
- **Papéis.**
  - Dono e recepção registram pagamento em qualquer atendimento; o profissional, só nos próprios (`agendaVisivel`).
  - Só o dono fecha e reabre o dia.
  - O profissional vê o próprio acerto.
- Já decididas no PRD (13/10):
  - a gorjeta vai 100% para quem atendeu, fora da divisão;
  - o desconto reduz o valor e a divisão é feita sobre o que foi pago;
  - o cliente "é de" quem o atendeu primeiro, e o dono troca à mão.

## Decisões propostas (confirmar ao aprovar o plano)
1. **A conta da divisão**, por pagamento, em centavos:
   - `base = serviços − desconto` (a gorjeta fica fora da base);
   - `casa = base × parteDaCasa(atendente)`;
   - `resto = base − casa`;
   - se o cliente é de A ≠ atendente B: `A = resto × matriz(A, B)`;
   - quem atendeu fica com o que sobra, mais a gorjeta.
   - Arredondamento: cada parte é arredondada para baixo, e a sobra de centavos vai para quem atendeu. A soma das partes é sempre igual ao valor pago.
2. **A divisão é congelada no pagamento.** Cada pagamento grava as suas partes. Mudar as regras vale só para os pagamentos novos; editar um pagamento (com o dia aberto) refaz as partes dele com as regras de agora.
3. **De quem é o cliente:**
   - nova coluna `cliente.profissional_id`;
   - a migração preenche os clientes atuais com quem atendeu o 1º agendamento **concluído** de cada um; quem não tem nenhum fica sem dono;
   - registrar pagamento de um cliente sem dono passa o cliente para quem atendeu;
   - se o profissional de quem o cliente é estiver inativo, não há divisão (quem atendeu fica com tudo), e o cliente continua dele até o dono trocar.
4. **Uma forma de pagamento por atendimento** (`pix`, `dinheiro`, `debito`, `credito`, de `FORMAS_DE_PAGAMENTO`). Pagamento dividido em duas formas fica para depois.
5. **Quem recebeu** começa como quem atendeu e pode ser trocado por outro membro ativo ("paguei na maquininha do Gustavo").
6. **O status acompanha o pagamento:**
   - registrar o pagamento conclui o atendimento;
   - tirar o `concluido` de um atendimento pago apaga o pagamento, se o dia está aberto; com o dia fechado, dá 409 `dia_fechado`;
   - um concluído sem pagamento aparece como pendência no Caixa.
7. **O dia do caixa é a data do agendamento**, não o dia em que o pagamento foi registrado.
8. **Fechar com pendência:** o dono pode fechar o dia mesmo com atendimento sem pagamento ou ainda "confirmado". A tela avisa quantos são antes de fechar.
9. **Reabrir** apaga o fechamento. O histórico de reaberturas fica para o marco 4, se o dono pedir.
10. **Plano sem `caixa`** (o Grátis): as rotas do caixa dão 403 `recurso_do_plano`, e a tela mostra o convite para escolher um plano. A barbearia que cai no Grátis guarda os dados, mas não registra nem vê o caixa.
11. **Dinheiro em centavos inteiros** nas tabelas novas, como em `planos.ts`. O `precoNoMomento` (`Decimal`) vira centavos ao somar os serviços.
12. **Divisão do dinheiro** é uma tela nova nas Configurações, só do dono, que não entra no "X de N decididas" (como o Seu perfil).

## Modelo (PR 2, migração `20261017120000_caixa`)
- `cliente.profissional_id` → `barbeiro` (anulável, `ON DELETE SET NULL`), com o preenchimento do item 3.
- `barbeiro.parte_da_casa`: `SMALLINT` de 0 a 100, padrão 0.
- `regra_de_divisao`:
  - colunas: `barbearia_id`, `dono_do_cliente_id`, `atendente_id`, `percentual` (0 a 100);
  - chave primária nos três ids;
  - CHECK `dono_do_cliente_id <> atendente_id`;
  - par sem linha = 0.
- `pagamento`:
  - `id`;
  - `barbearia_id`;
  - `agendamento_id` (UNIQUE, `ON DELETE CASCADE`);
  - `data` (a do agendamento, com índice `(barbearia_id, data)`);
  - `atendente_id`, `dono_do_cliente_id` (anulável) e `recebido_por_id`;
  - `forma`, com CHECK na lista;
  - `servicos_centavos`, `desconto_centavos` e `gorjeta_centavos`, todos ≥ 0, com CHECK desconto ≤ serviços;
  - `registrado_por_id` e `registrado_em`.
- `pagamento_parte`:
  - `pagamento_id` (`ON DELETE CASCADE`);
  - `beneficiario_id` (anulável = a casa);
  - `motivo`: `atendimento`, `cliente`, `casa` ou `gorjeta`, com CHECK;
  - `valor_centavos` ≥ 0.
- `fechamento_do_dia`:
  - `barbearia_id` e `data` (UNIQUE juntos);
  - `fechado_por_id` e `fechado_em`;
  - `acerto` (`JSONB`, a foto do acerto na hora de fechar).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Lista fechada + conta pura compartilhada | `barchop/packages/formato/src/planos.ts`, `pagina.ts:20` | constantes `as const`, funções puras testadas em `packages/formato/tests/*.test.ts`; API e web leem do mesmo lugar (ADR-0007) |
| Recurso do plano | `barchop/packages/formato/src/planos.ts:99` (`temRecurso`), `apps/api/src/lib/assinatura.ts:89` | a API lê o plano efetivo e recusa; aqui 403 `recurso_do_plano` (o recurso não existe no plano, não é regra violada) |
| Erro de negócio | `barchop/apps/api/src/lib/erro-negocio.ts` | `ErroDeNegocio(mensagem, codigo)` → 422; 409 `dia_fechado` via `ErroHttp` |
| Papel | `barchop/apps/api/src/plugins/auth.ts:218` (`exigirPapel`), `:228` (`agendaVisivel`) | fechar, reabrir e regras = `exigirPapel("dono")`; o pagamento usa `agendaVisivel` como o PATCH do agendamento (`routers/agendamentos.ts:286`); a matriz de papéis fica em `tests/routers/auth-papeis.test.ts` |
| Rota da barbearia logada | `barchop/apps/api/src/routers/ocupacao.ts` | `GET /barbearias/me/...?data=YYYY-MM-DD` com `PADRAO_DATA` |
| Serialização | `barchop/apps/api/src/lib/serializar.ts:33` | resposta montada campo a campo; centavos como número |
| Migração à mão | `migrations/20261014120000_assinatura` | SQL com CHECK das listas; `migrate deploy`, nunca `migrate dev` (coluna gerada `agendamento.periodo`) |
| Testes de API | `barchop/apps/api/tests/routers/ocupacao.test.ts`, `limite-do-plano.test.ts` | `buildApp` + `app.inject`, banco de teste, fixtures em `tests/helpers` |
| Testes de tela | `barchop/apps/web/tests/painel/sino-de-notificacoes.test.tsx` | Testing Library + `fetch` falso |
| Telas | memória "telas sem blocos" e "telas horizontais" | ação principal em destaque, pílulas para poucas opções, Salvar/Descartar só quando muda, colunas lado a lado no desktop |
| Menu lateral | `barchop/apps/web/src/painel/NavegacaoDoPainel.tsx:25` | item "Caixa" entre Agenda e Folgas |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/packages/formato/src/caixa.ts` (+ `tests/caixa.test.ts`, `index.ts`) | CREATE | `dividirPagamento()`, `acertoDoDia()` (recebeu, cabe, saldo e repasses entre pessoas, já compensados) |
| `barchop/packages/database/prisma/schema.prisma` + `migrations/20261017120000_caixa/migration.sql` | UPDATE / CREATE | modelo acima |
| `barchop/apps/api/src/lib/caixa.ts` | CREATE | ler as regras, montar e gravar o pagamento com as partes, garantir dia aberto e recurso do plano |
| `barchop/apps/api/src/routers/caixa.ts` | CREATE | pagamento, caixa do dia, fechar/reabrir, regras de divisão |
| `barchop/apps/api/src/routers/agendamentos.ts` | UPDATE | sair do `concluido` apaga o pagamento ou dá 409 |
| `barchop/apps/api/src/routers/clientes.ts` | UPDATE | `profissionalId` no GET e no PATCH (só o dono troca) |
| `barchop/apps/api/src/app.ts` | UPDATE | registrar as rotas novas no escopo protegido |
| `barchop/packages/api-client` (+ dublê) | UPDATE | métodos novos |
| `barchop/apps/web/src/telas/painel/DetalheDoAgendamento.tsx` | UPDATE | "Concluir e registrar pagamento" |
| `barchop/apps/web/src/telas/painel/CaixaDoDia.tsx` + `app/(painel)/painel/(guardado)/caixa/page.tsx` | CREATE | a tela do Caixa |
| `barchop/apps/web/src/telas/painel/configuracoes/DivisaoDoDinheiro.tsx` + rota | CREATE | matriz + parte da casa |
| `barchop/apps/web/src/telas/painel/DetalheDoCliente.tsx` | UPDATE | "Cliente de …" com trocar (dono) |
| `barchop/apps/web/src/painel/NavegacaoDoPainel.tsx`, `novidades.ts`, Central de ajuda | UPDATE | menu, novidade, perguntas |
| `barchop/docs/screens.md`, PRD | UPDATE | telas novas; marco 2 |

## Tasks (um PR por task; TDD com commit RED e depois GREEN)

### PR 1: A conta do caixa em `@barchop/formato`
- **Action**: `caixa.ts` com `dividirPagamento({ servicos, desconto, gorjeta, atendente, donoDoCliente, parteDaCasa, matriz })` → partes e `acertoDoDia(pagamentos)` → por pessoa (e a casa): recebeu, cabe, saldo; mais a lista mínima de repasses "X repassa R$ Y para Z" (compensa A→B com B→A).
- **Mirror**: `planos.ts` e o teste dele.
- **Validate**: `pnpm --filter @barchop/formato test` com os 4 casos da GR, a parte da casa, desconto, gorjeta, arredondamento (soma = pago), cliente sem dono e dono inativo.

### PR 2: Caixa no banco (MIGRAÇÃO)
- **Action**: schema e migração do modelo acima, com o preenchimento de `cliente.profissional_id`.
- **Mirror**: `20261014120000_assinatura`.
- **Validate**: `tests/banco.test.ts` (CHECKs, cascatas, preenchimento) + `migrate deploy` no dev e no teste.
- **Deploy**: lembrar que precisa do `migrar`.

### PR 3: Registrar pagamento (API)
- **Action**:
  - `PUT /agendamentos/:id/pagamento` (cria ou edita; conclui; dono do cliente automático) e `DELETE /agendamentos/:id/pagamento`;
  - o PATCH de status apaga o pagamento ao sair do `concluido`;
  - 409 `dia_fechado` e 403 `recurso_do_plano`.
- **Validate**: `tests/routers/pagamento.test.ts` (papéis, partes gravadas, dia fechado, Grátis, agendamento de outra barbearia = 404).

### PR 4: Caixa do dia (API)
- **Action**:
  - `GET /barbearias/me/caixa?data=` devolve pagamentos, totais por forma, o acerto, as pendências e se o dia está fechado. O profissional recebe só o que é dele.
  - `POST /barbearias/me/caixa/:data/fechamento` e `DELETE` (só o dono). O POST grava a foto do acerto.
- **Validate**: `tests/routers/caixa.test.ts`.

### PR 5: Regras de divisão e dono do cliente (API)
- **Action**:
  - `GET` e `PUT /barbearias/me/divisao` (matriz + parte da casa de cada membro ativo que atende; só o dono);
  - `profissionalId` no `GET /clientes/:id` e no `PATCH` (só o dono).
- **Validate**: `tests/routers/divisao.test.ts`, `clientes-id.test.ts`.

### PR 6: Registrar pagamento no detalhe do agendamento (web)
- **Action**:
  - "Concluir e registrar pagamento" como ação principal;
  - o valor começa com a soma dos serviços;
  - desconto e gorjeta opcionais;
  - forma de pagamento e quem recebeu em pílulas;
  - frase do efeito ("Ana fica com R$ 40,00, Gustavo com R$ 20,00");
  - com o pagamento registrado: resumo, editar ou remover; dia fechado: só leitura, com o aviso.
- **Validate**: teste da tela + navegador em 375 e 1440.

### PR 7: Tela Caixa (web)
- **Action**:
  - `/painel/caixa`: dia (anterior, hoje, próximo) e "Fechar o dia" em destaque (com aviso das pendências);
  - acerto por pessoa lado a lado e os repasses em frases;
  - totais por forma, a lista dos pagamentos e as pendências com link para o atendimento;
  - item "Caixa" no menu; convite no Grátis.
- **Validate**: teste da tela + navegador em 375 e 1440.

### PR 8: Divisão do dinheiro e "Cliente de" (web)
- **Action**:
  - `/painel/configuracoes/divisao`: a grade "cliente de ↓ × atendeu →" e a parte da casa, com a frase do efeito;
  - no detalhe do cliente, "Cliente de X" com Trocar (dono);
  - novidade e perguntas na Central de ajuda;
  - `screens.md`.
- **Validate**: testes das telas + navegador.

## Validation
```bash
cd barchop
pnpm --filter @barchop/formato test
pnpm --filter @barchop/api test -- <arquivos tocados>   # suíte inteira se mexer em lib/agendamento.ts
pnpm --filter @barchop/web test -- <arquivos tocados>
pnpm type-check && pnpm lint
pnpm --filter @barchop/database exec prisma migrate deploy   # dev e test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Cliente atribuído errado na migração (1º concluído ≠ "de quem é" de verdade) | High | O dono troca no detalhe do cliente (PR 8); avisar na novidade para conferir os clientes |
| Acerto diverge do caderno da GR | Medium | Casos da GR escritos como teste no PR 1; duas semanas em paralelo com o caderno (PRD) |
| Arredondamento de centavos dá diferença de R$ 0,01 | Medium | Sobra vai para quem atendeu; teste "soma das partes = pago" |
| Muitos concluídos antigos sem pagamento poluem as pendências | Medium | Pendência só conta do dia mostrado, e o caixa começa a valer da data do deploy em diante |
| Profissional vendo dinheiro dos colegas | Medium | O GET do caixa filtra por papel; teste na matriz de papéis |
| Mudar regra no meio do dia confunde o acerto | Low | Partes congeladas no pagamento (decisão 2) |

## Acceptance
- [ ] A GR consegue fechar um dia com os 4 casos dela e o acerto bate com a conta à mão
- [ ] Os 8 PRs no ar, cada um em produção antes do próximo
- [ ] Validação passa
- [ ] Padrões espelhados, não reinventados
