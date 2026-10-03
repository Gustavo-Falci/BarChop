# Decisões técnicas

Registro do porquê de cada escolha, não só o quê — pra não perder
o raciocínio depois.

A partir de 2026-10-02 as decisões novas são ADRs, um arquivo por
decisão, em `docs/adr/` (índice no `README.md` de lá). Este arquivo
fica com as decisões da fundação, anteriores a essa data.

## Monorepo: pnpm workspaces + Turborepo

Mobile, painel e API compartilham tipos, tokens de design e a
lógica de cálculo de disponibilidade — sem monorepo isso duplicaria
ou dessincronizaria. pnpm por eficiência de disco e suporte a
`workspace:*`; Turborepo pra orquestrar build/dev com cache.

**Pegadinha conhecida**: o Metro (bundler do Expo) não lida bem com
o node_modules simbólico padrão do pnpm — por isso o
`.npmrc` com `node-linker=hoisted` e o `metro.config.js` customizado
em `apps/mobile`.

## Framework HTTP: Fastify

Comparado com Express e Hono. Decisivo: validação de schema nativa
(JSON Schema direto na rota, sem precisar de Zod à parte) e boa
inferência de tipo com `@fastify/type-provider-json-schema-to-ts` —
casa com o resto do projeto sendo TypeScript estrito. Express tem
mais tutorial/mais gente usando, mas você reconstrói na mão o que
o Fastify já resolve.

## ORM: Prisma

Comparado com Drizzle e SQL puro + Kysely. Decisivo: a maior
comunidade do ecossistema TS, e como o schema já estava bem
definido, a geração automática de tipos elimina manter
`@barchop/types` como espelho de tabela à mão.

**Pegadinha conhecida**: nem Prisma nem Drizzle sabem representar a
`EXCLUDE USING gist` (trava anti-conflito de horário) nem colunas
`GENERATED ALWAYS AS ... STORED` no schema declarativo. Solução:
adicionadas à mão na migration inicial — ver
`packages/database/README.md`.

## Banco: PostgreSQL com exclusion constraint

Além do cálculo de horários livres feito na aplicação
(`packages/scheduling`), o banco tem uma trava própria contra dois
agendamentos do mesmo barbeiro se sobrepondo — protege contra
condição de corrida (dois clientes confirmando o mesmo horário ao
mesmo tempo), que a lógica da aplicação sozinha não resolveria de
forma confiável.

## Identidade visual: neobrutalismo, referência de mercado

O estilo (bordas grossas, sombras duras sem desfoque, amarelo
`#FFD900` como cor de ação única) foi adaptado de uma auditoria de
UI do **barbeiro.app**, um concorrente já existente no mercado —
não afiliado ao BarChop. Decisão consciente de seguir de perto
essa linguagem visual, não só usar como inspiração solta.
Tokens completos em `packages/design-tokens` e
`docs/design-system.html`.

## Pasta de rotas: `routers`

`apps/api/src/rotas` virou `apps/api/src/routers` em 2026-09-04, e
`apps/api/tests/rotas` acompanhou. O plural casa com a pasta irmã
`plugins/`.

O resto do código continua em português — os registradores ainda se
chamam `registrarRotasClientes`, e comentário e mensagem de erro seguem
a mesma regra de antes. É um ponto misto assumido, não um começo de
tradução do código.

**Consequência**: os documentos em `docs/superpowers/` citam caminhos
`rotas/...`. Eles não foram reescritos de propósito — são specs e planos
datados, e corrigi-los faria cada um descrever um código que não existia
naquele dia. Ao seguir um caminho `rotas/` num documento antigo, leia
`routers/`.

## Preencher formulário com dado buscado: durante o render, não em `useEffect`

Quatro telas do painel — `ConfiguracoesDaBarbearia`, `CadastroDeServico`,
`DetalheDoCliente` e `DetalheDoAgendamento` — sincronizam o estado do
formulário a partir do dado buscado durante a própria renderização, e
não num `useEffect`: comparam o dado contra uma referência rastreada
num `useState` e chamam `setState` só quando ela muda.

Um efeito roda depois do commit. Entre o commit (que já mostra o
formulário, com o campo vazio) e o efeito (que preenche), existe uma
janela em que a tela está visível e vazia — e quem digita nela perde a
corrida: o preenchimento chega por cima do que já foi escrito. Foi
reproduzido sob carga real como `nome: 'GR BarberGR Barber Centro'` em
`ConfiguracoesDaBarbearia` e `'João SilvaJoão da Silva'` em
`DetalheDoCliente` — o valor buscado concatenado com o que já estava no
campo, não um timeout qualquer. Sincronizar durante a renderização
fecha a janela: o React descarta esse render e refaz com o valor certo
antes de pintar qualquer coisa na tela, então não existe commit
intermediário pra ver ou agir sobre ele. A comparação contra a
referência rastreada é o que evita o loop de renderização.

**Pegadinha conhecida**: os testes que fixam essa regra (a sonda em
`apps/web/tests/ajudantes/sondaDeCorrida.tsx`) dependem de uma garantia
do React, não de um timer — dentro de UM commit, todo `useLayoutEffect`
roda antes de qualquer `useEffect`, que é sempre passivo e adiado. Um
upgrade de major do React deveria reverificar essas sondas por mutação
(voltar a versão `useEffect` e confirmar que o teste falha de novo),
não só rodar a suíte e ver verde.
