# Plan: Tela de serviços com foto e descrição

**Source**: pedido do usuário (2026-10-05) + prints de referência (cartões com foto, descrição, preço, duração, próximos horários, categoria com ícone e contagem)
**Complexity**: Large (banco + API + api-client + painel + tela pública), em 3 PRs

## Summary
A tela pública `EscolhaDeServicos` hoje é uma lista crua de checkboxes (nome + preço). Ela passa a mostrar os serviços agrupados por categoria, em cartões com foto (ou monograma), descrição curta, preço, duração e próximos horários, com seleção clara e barra de resumo fixa no celular. Para isso o serviço ganha `descricao` e foto (`fotoChave`), cadastrados no painel. A identidade BarChop fica (creme/amarelo, borda preta, sombra deslocada). A multi-seleção com "Continuar" continua igual.

## Decisões (usuário, 2026-10-05)
- Escopo: visual + descrição + foto.
- Estilo: identidade BarChop. Das referências vem só a estrutura e a hierarquia, não o tema escuro.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Upload de imagem | `barchop/apps/api/src/routers/imagens.ts:92` | `POST/DELETE /equipe/:id/foto`: dono só, `lerImagem` com teto, chave sorteada, `apagarSemFalhar` na antiga, 404 em outra barbearia |
| Chave → URL | `barchop/apps/api/src/routers/equipe.ts:159` | `fotoChave ? urlPublica(fotoChave) : null` no serializador |
| Texto livre opcional | `barchop/apps/api/src/routers/servicos.ts:61` | `limparCategoria`: trim, vazio vira null, undefined não mexe |
| Migration | `barchop/packages/database/prisma/migrations/20261005120000_lembrete_ativo` | timestamp + nome curto, coluna nullable |
| api-client | `barchop/packages/api-client/src/barbeiro.ts:438` | `enviarFotoDoMembro` com FormData no campo `arquivo`, mais o espelho em `falso.ts:319` |
| Campo de imagem | `barchop/apps/web/src/telas/painel/CadastroDeMembro.tsx:338` | `CampoDeImagem` só na edição, salva sozinho |
| Agrupar | `barchop/apps/web/src/fluxo/categorias.ts` | `agruparPorCategoria`, que já existe e já é usado no perfil |
| Próximos horários | `barchop/apps/web/src/telas/PerfilDaBarbearia.tsx:157` | `api.publico.proximosHorarios` + `rotuloDoProximoHorario`; chip leva a `confirmar` |
| Tests | `barchop/apps/api/tests/routers/imagens.test.ts`, `barchop/apps/web/tests/telas/escolha-de-servicos.test.tsx` | Vitest; API contra o banco `_test`; web com `criarApiClientFalso` + Testing Library por papel/texto |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/database/prisma/schema.prisma` | UPDATE | `Servico.descricao String? @db.VarChar(300)`, `Servico.fotoChave String? @map("foto_chave") @db.VarChar(200)` |
| `packages/database/prisma/migrations/20261006120000_servico_descricao_foto/` | CREATE | migration das 2 colunas |
| `packages/types/src/*.ts` | UPDATE | `ServicoSerializado` + `descricao: string \| null`, `fotoUrl: string \| null` |
| `apps/api/src/lib/serializar.ts` | UPDATE | `serializarServico(servico, urlPublica)` |
| `apps/api/src/routers/servicos.ts` | UPDATE | `descricao` no POST/PATCH (maxLength 300, trim → null), passar `urlPublica` |
| `apps/api/src/routers/imagens.ts` | UPDATE | `POST/DELETE /servicos/:id/foto` (2 MB, chave `barbearias/{b}/servicos/{s}/{uuid}.ext`) |
| `apps/api/tests/routers/servicos*.test.ts`, `imagens.test.ts` | UPDATE | descrição, foto, isolamento entre barbearias, papel |
| `packages/api-client/src/barbeiro.ts`, `falso.ts` | UPDATE | `enviarFotoDoServico`, `removerFotoDoServico`, descrição no criar/editar; falso com dados de exemplo |
| `apps/web/src/componentes/CampoDeImagem.tsx` (+css) | UPDATE | `formato="quadrado"` |
| `apps/web/src/telas/painel/CadastroDeServico.tsx` (+css) | UPDATE | textarea Descrição (contador 0/300) + foto na edição |
| `apps/web/src/componentes/ItemDeServico.tsx` (+css) | UPDATE | cartão novo |
| `apps/web/src/fluxo/iconeDaCategoria.tsx` | CREATE | SVG inline por palavra-chave da categoria (sem lib nova) |
| `apps/web/src/telas/EscolhaDeServicos.tsx` (+css) | UPDATE | grupos, próximos horários, barra fixa, estados |
| `apps/web/tests/...` | UPDATE/CREATE | painel e tela pública |

## Tasks

### PR A — `servico-descricao-foto-api` (TDD RED → GREEN)
1. **Migration + schema**: as 2 colunas nullable. Rodar `migrate deploy` nos bancos dev e test.
   - Validate: `pnpm --filter @barchop/database exec prisma migrate status`
2. **Tipos + serializador**: `descricao`, `fotoUrl`. Os 3 call sites em `servicos.ts` e a rota pública passam `app.armazenamento.urlPublica`.
3. **Descrição no POST/PATCH**: `{ type: ["string","null"], maxLength: 300 }`; função `limparTextoOpcional` generaliza `limparCategoria`.
   - Testes: cria com descrição; "  " vira null; 301 chars dá 400; PATCH null apaga; a rota pública devolve `descricao` e `fotoUrl`.
4. **Foto**: espelhar `/equipe/:id/foto`. Testes: dono envia (200 + url), profissional recebe 403, serviço de outra barbearia dá 404, tipo inválido dá 422, DELETE zera, a antiga é apagada.
5. **api-client**: métodos + falso (s1 Corte com descrição; um sem foto, para o monograma).
   - Validate: `pnpm --filter @barchop/api test`, `pnpm --filter @barchop/api-client test`, typecheck do monorepo

### PR B — `servico-descricao-foto-painel`
6. `CampoDeImagem` aceita `formato="quadrado"` (proporção 1:1 na prévia; o redimensionamento já cobre).
7. `CadastroDeServico`: campo Descrição (textarea, limite espelhando a API, contador), enviado no criar e no editar como a categoria; `CampoDeImagem` "Foto do serviço" só na edição, como no membro.
8. `ListaDeServicos`: miniatura 40px ao lado do nome (foto ou inicial).
   - Validate: `pnpm --filter web test -- servicos`

### PR C — `escolha-de-servicos-visual`
9. **Cabeçalho**: título "Escolha os serviços" + subtítulo "Marque um ou mais. Você escolhe o profissional e o horário depois."
10. **Grupos**: `agruparPorCategoria`; cabeçalho com ícone (tesoura: corte/cabelo; navalha: barba; gota: tratamento/hidratação/sobrancelha; coroa: especial/pacote/combo/noivo; estrela no fallback), título e "N serviços". Sem categoria: lista única, como hoje.
11. **Cartão** (`ItemDeServico`), ainda `<label>` + checkbox real:
    - foto 64px com cantos arredondados e borda preta; sem foto, monograma (inicial sobre amarelo-claro);
    - nome em negrito; descrição com clamp de 2 linhas (o texto inteiro fica no DOM para leitor de tela);
    - preço em destaque à direita, e embaixo dele relógio + "30 min";
    - indicador de seleção grande (quadrado com ✓) no lugar do checkbox nativo (o input fica visualmente oculto e acessível, com foco visível no cartão);
    - marcado: fundo amarelo-claro, sombra deslocada, leve "afundar" (transform), respeitando `prefers-reduced-motion`;
    - hover: a sombra cresce.
12. **Próximos horários** no rodapé do cartão ("HOJE 19:40", "AMANHÃ 09:00 09:30 10:00"), reaproveitando o endpoint e o rótulo do perfil. O chip leva direto à confirmação só com aquele serviço, como no perfil. Fora do `<label>` (link dentro de label quebra o clique do checkbox). Sem horários, o rodapé some.
13. **Resumo**:
    - desktop: lateral sticky com a lista dos marcados (nome + preço), total, duração e "Continuar"; vazio mostra "Nenhum serviço escolhido ainda";
    - celular: barra fixa no rodapé ("2 serviços · 50 min · R$ 65,00" + Continuar), que aparece só com algo marcado; `padding-bottom` na página para não cobrir o último cartão; `env(safe-area-inset-bottom)`.
14. **Estados**: carregando com 3 cartões-esqueleto; erro com texto + "Tentar de novo"; lista vazia com "Esta barbearia ainda não cadastrou serviços".
15. **Testes**: os 5 existentes continuam verdes (papel checkbox, nomes, soma, navegação); novos: grupo com contagem, descrição visível, monograma sem foto, `<img alt>` com foto, chip leva a `confirmar?servicos=s1&data=…&hora=…`, barra do resumo aparece só com seleção.
   - Validate: `pnpm --filter web test`, `pnpm --filter web lint`, typecheck; olhar no navegador em 375px e 1440px

## Validation
```bash
cd barchop
pnpm --filter @barchop/database exec prisma migrate deploy   # dev e test
pnpm -r typecheck
pnpm --filter @barchop/api test
pnpm --filter @barchop/api-client test
pnpm --filter web test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Mudar a assinatura de `serializarServico` quebra o mobile (Expo) | Low | Os campos são só adicionados; o mobile ignora o que não usa. Typecheck do monorepo |
| Próximos horários em cada cartão = 1 requisição a mais na tela | Low | Já é uma chamada só (`/proximos-horarios`, por barbearia), igual ao perfil; falha nela só esconde os chips |
| Chip de horário pula a multi-seleção e confunde quem já marcou outros | Medium | Rótulo acessível "Agendar só {serviço} {dia} às {hora}"; reavaliar no navegador. Plano B: tirar os chips desta tela e mantê-los só no perfil |
| PC do trabalho sem memória para o dev server e os testes do Next | Medium | Rodar suítes por filtro; reiniciar o web |
| Hook GateGuard/stop typecheck travando edições | Low | Responder os fatos e seguir |
| Clamp de descrição em navegador antigo | Low | `-webkit-line-clamp` + `line-clamp`; sem suporte, o texto só fica inteiro |

## Fora do escopo
- Foto e descrição na página da barbearia (`PerfilDaBarbearia`): candidata a PR D, pequeno, depois deste.
- Tema escuro.
- Ordem manual dos serviços e das categorias.

## Acceptance
- [ ] 3 PRs mergeados (A API, B painel, C tela), cada um com commit RED e GREEN
- [ ] Suítes verdes; contagem nova anotada
- [ ] Tela vista no navegador no celular e no desktop, com e sem foto, com e sem categoria
- [ ] Patterns espelhados (foto igual ao membro, texto opcional igual à categoria)
