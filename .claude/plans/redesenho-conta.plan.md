# Plan: Redesenho de conta, faturas, ajuda, cartaz e suporte (onda C)

**Fonte**: manual `barchop/docs/UI_UX_DESIGN_GUIDELINES.md` e o canvas do Claude Design, página "Conta, ajuda e suporte", nos dois temas (https://claude.ai/artifact/LpMm9AAYAVzsQXsZB1w7Xb, versão `1793973547-0f35`), feito com o Design System do BarChop instalado no canvas (componentes reais compilados). O dono aprovou o desenho em 06/11 ("Aprovado"). O canvas é direção, não especificação: regra de negócio e decisão registrada no código valem mais que ele (manual §18.4–5).

Terceira de quatro ondas do pedido do dono de 01/11: A detalhes e cadastros do painel (feita, #280–#287) → B o que o cliente vê (feita, #291–#299) → **C o resto do painel** → D o site de divulgação.

## Telas da onda C (11 telas, 10 rotas)
- `/painel/entrar` → `EntrarNoPainel` (+ `RecuperarSenhaDoPainel`, no mesmo lugar)
- `/painel/cadastro` → `CadastroDoDono`
- `/painel/convite` → `AceitarConvite`
- `/painel/faturas` → `Faturas` (sem plano pago: assinar; com plano: em dia, em atraso)
- `/painel/faturas/cancelado` → `CheckoutCancelado`
- `/painel/ajuda` → `CentralDeAjuda`
- `/painel/cartaz` → `hoje/CartazDoLink`
- `/painel/suporte/entrar` → `suporte/EntrarNoSuporte`
- `/painel/suporte` → `suporte/FilaDoSuporte`
- `/painel/suporte/avisos` → `suporte/AvisosDoSuporte`
- Entrar, Recuperar, Convite e Suporte-entrar já usam o mesmo `EntrarNoPainel.module.css`; o Cadastro tem o dele.

## O que o dono aprovou (06/11)
1. **Um formato só para as entradas**: barra do BarChop no topo, título em cima, formulário embaixo. Vale para Entrar, Recuperar (com a etapa do código), Cadastro (dados e código), Convite e Entrar no suporte.
2. **Faturas**:
   - trilha Plano / Pagamento / Acesso liberado em 3 colunas fixas;
   - sem selo do teste no título;
   - títulos de seção sem CAIXA ALTA.
   - Dentro de Faturas, a faixa do teste não mostra "Escolher plano", porque a tela já é a dos planos. É a única mudança no shell.
3. **"Checkout cancelado" vira "Pagamento não concluído"**, com "Tentar de novo".
4. **Cartaz**:
   - fica branco nos dois temas, com "← Voltar ao painel" e Imprimir em amarelo;
   - o link aparece sem o `https://`, quebrando no ponto (`barbearia-teste` / `.barchop.com.br`), na tela e no papel.
5. **Suporte, mudança leve**:
   - entrada no formato das outras;
   - Fila e Avisos com a barra "BarChop · Suporte" + Sair e as abas Pedidos / Avisos;
   - recusa com "Resposta pro dono" e Confirmar recusa / Voltar.
6. **Outros textos**:
   - em Faturas com plano em atraso, o botão do Portal diz "Atualizar o cartão" (abre o mesmo Portal);
   - o Convite pede "Crie uma senha" e, no fim, diz para pedir um convite novo a quem convidou, em Equipe;
   - no Cadastro, o apoio do link fica "O link dos seus clientes: gr-barber.barchop.com.br".

## Decisões deste plano (o canvas não manda)
- **A barra do painel e a navegação de baixo nas pranchas são só contexto.** Não mudam: continuam com o slug, o menu "…" e o resto de hoje.
- **Preço nos botões de Faturas.**
  - "Continuar com o Essencial" fica sem o preço, como o dono aprovou. O valor continua no resumo "Seu pedido".
  - **Pergunta aberta, perguntar ao dono antes do PR 3:** a prancha também tira o preço de "Assinar o Essencial · R$ 0,00 hoje", mas isso não foi citado no relatório da aprovação.
- **O que o código já decide e a prancha não mostrou** (fica como está):
  - o bloco "Recomendado pelo seu uso no teste";
  - a escolha mensal/anual com o selo "2 meses grátis";
  - o comparativo de planos;
  - as perguntas frequentes;
  - Pix e Boleto como "Em breve";
  - o aviso do teste com menos de 48h (regra da Stripe).
- **Textos que a prancha deixou provisórios**:
  - as respostas da Central de ajuda são as de hoje, incluindo o link para a tela certa;
  - os avisos publicados vêm da API, como hoje.
- **O endereço sem `https://` é só o que aparece escrito.** O QR code, o copiar e o compartilhar continuam com o link inteiro (`linkDaBarbearia`). Isso pede uma função de exibição única, com teste, usada no Cartaz e no Cadastro. Ela tem dois formatos:
  - com `NEXT_PUBLIC_URL_DO_SITE` (produção), o subdomínio `gr-barber.barchop.com.br`;
  - sem ele (desenvolvimento), o caminho `localhost:3000/gr-barber`.

  Nos dois, tira o protocolo e quebra antes do primeiro `.` ou `/` depois do slug.
- **Computador fica como está.** O canvas só tem 390px. O layout lado a lado de Faturas e de Avisos (`LadoALado`) não muda; só os detalhes que valem nas duas larguras.
- **O cartaz impresso não muda de regra de impressão**: botão e voltar somem no papel, como hoje.
- **Fora da onda:** nada pede API nova. Se algum PR precisar, o item sai e vira nota.

## PRs
### PR 1 — Entradas (Entrar, Recuperar, Convite, Entrar no suporte), semente e este plano
- **Formato único** em `EntrarNoPainel.module.css`: barra do BarChop no topo, título alinhado em cima (hoje centralizado no meio).
  - "BarChop · Suporte" na entrada do suporte.
- **Textos**:
  - Convite: "Crie uma senha" e o rodapé "peça pra quem te convidou mandar de novo, em Equipe";
  - Suporte: apoio "Área da equipe do BarChop…".
- **Recuperar**: o "← Entrar com senha" no topo nas duas etapas, como na página pública (#296).
- **Semente** (`apps/api/scripts/conferencia-visual.ts`):
  - cria a conta do suporte só quando `SENHA_DO_SUPORTE` está no ambiente (a senha nunca vai pro repo);
  - cria um pedido de troca de link pendente e um aviso publicado;
  - imprime o e-mail do suporte.
- **Feito (06/11):**
  - componente novo `componentes/TelaDeEntrada` com a casca: barra do BarChop (+ "· Suporte"), voltar opcional, h1 em `--texto-xl` e apoio, tudo no topo. No computador a barra some e a tela dividida de antes fica (a coluna de 420px centrada na metade direita). O `.pagina` saiu do `EntrarNoPainel.module.css`, que agora guarda só o miolo;
  - Entrar: apoio "A agenda, os clientes e o caixa da sua barbearia."; "Esqueci a senha" colado embaixo do campo de senha, à direita; o convite virou um bloco com linha em cima ("Alguém da barbearia te convidou pra equipe?" + "Entrar com o código do convite"); "Criar barbearia" no fim;
  - Recuperar: "← Entrar com senha" no topo nas duas etapas (saiu o "Voltar pra entrar" do fim); a explicação virou apoio do título, e o "mandamos um código" é `role="status"`; "Mínimo de 8 caracteres" no campo da nova senha; "Não chegou? Reenviar código" abaixo do formulário;
  - Convite: "← Entrar com senha" (link) no topo, no lugar do "Já tem senha? Entrar"; "Crie uma senha" com "Mínimo de 8 caracteres"; rodapé "O código não chegou? Peça pra quem te convidou mandar de novo, em Equipe.";
  - Suporte: "Entrar no suporte", com a área na barra e o apoio;
  - formulário com `--espaco-md` entre os campos (era `lg`), como na prancha;
  - semente: com `SENHA_DO_SUPORTE`, cria `suporte@exemplo.com`, um pedido de troca pendente (`gr-barber-centro`) e um aviso publicado com cópia no sino dos membros; sem ela, diz como ligar;
  - os testes vieram junto com a troca, e não antes (ajuste de texto e de casca);
  - 1689 testes passando; conferido 390 escuro (entrar), 360 claro (suporte, recuperar com código), 1280 escuro (convite).

### PR 2 — Cadastro do dono
- Mesmo formato das entradas, nas duas etapas (dados, código).
- Apoio do link: "O link dos seus clientes: gr-barber.barchop.com.br. Escolha com calma: …".
- Usa a função de exibição do endereço, sem `https://`.

### PR 3 — Faturas: assinar (teste e Grátis)
- Trilha em 3 colunas fixas.
- Sem o selo do teste no título.
- Títulos sem caixa alta.
- Cartões de plano e "Seu pedido" conferidos contra a prancha, nos dois casos:
  - **teste**: hoje R$ 0,00, cobrança no fim do teste;
  - **Grátis/cancelada**: preço cheio hoje, "renova a cada mês", "Nada foi apagado".
- A faixa do teste sem "Escolher plano" dentro de `/painel/faturas`. É a única mudança no shell; teste próprio.

### PR 4 — Faturas com plano e Pagamento não concluído
- Cartão do plano:
  - "Próxima cobrança em …";
  - selo Em dia / Pagamento pendente;
  - em atraso, um aviso e o botão do Portal com "Atualizar o cartão".
- Cobranças em linhas no celular, com selo e ação (Pagar / Recibo). No desktop, conferir se a tabela fica.
- `CheckoutCancelado`:
  - título "Pagamento não concluído", sem falar do teste (a tela aparece também para quem não está em teste);
  - "Tentar de novo" no lugar de "Ver planos".

### PR 5 — Central de ajuda
- Grupos com título normal e perguntas que abrem e fecham (botão com `aria-expanded`).
- Respostas e links de hoje.

### PR 6 — Cartaz
- Barra com "← Voltar ao painel" e "Sai numa folha A4".
- Cartão com borda, nome, chamada, QR e o endereço.
- Imprimir em `--cor-accent`.
- O endereço quebra no ponto (`<wbr>`), nunca estoura o cartão; teste com um slug longo.
- Na impressão: barra e botão somem, o cartão ocupa a folha.

### PR 7 — Suporte: fila e avisos
- Barra "BarChop · Suporte" com Sair.
- Abas Pedidos / Avisos (`aria-current`) no lugar do botão "Avisos da plataforma" e do voltar dos Avisos.
- Pedido:
  - links atual e pedido num bloco;
  - motivo com rótulo;
  - Aprovar / Recusar lado a lado;
  - recusa com "Resposta pro dono" + "É o que ele lê em Configurações." como apoio.
- Avisos:
  - "Novo aviso" como h2;
  - publicados em linhas com "X de Y leram" num selo.

## Conferência visual
- Ligar a semente `apps/api/scripts/conferencia-visual.ts` (de `barchop/`) e `pnpm --filter web dev`. O painel entra com o dono da semente.
  - Faturas com plano pago não roda localmente (Stripe); esse estado se confere pelos testes e pelo desenho.
  - O suporte precisa de `SENHA_DO_SUPORTE` no ambiente.
- A cada PR: 360, 390 e 1280px, nos dois temas.
- Testes primeiro (TDD) no que muda comportamento ou texto; a suíte web inteira verde antes do PR.
