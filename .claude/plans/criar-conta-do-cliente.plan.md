# Plan: Criar conta do cliente e juntar os horários do telefone

**Fonte**: canvas do Claude Design, página "Página pública", fileira "Novo (06/11): criar conta e juntar os horários do telefone (A + B + C)" (https://claude.ai/artifact/LpMm9AAYAVzsQXsZB1w7Xb, versão `1794004977-c4f1`, pranchas `Pub-ConfirmadoConta`, `Pub-ContaEntrar`, `Pub-CriarConta(-Codigo/-Pronta/-Historico)`, `Pub-ConfirmadoContaDesktop`, cada uma com `-Claro`). O dono aprovou em 06/11 ("Aprovado"). Manual `barchop/docs/UI_UX_DESIGN_GUIDELINES.md`.

## O problema
- **Criar conta estava escondido.** O caminho era Entrar → "Primeira vez aqui, ou esqueceu a senha?" → "Receber um código no e-mail", e as palavras "Criar conta" não apareciam em nenhuma tela.
- **Agendar sem conta e depois criar a conta com o mesmo telefone dava erro.**
  - O agendamento público cria o cadastro pelo telefone, sem e-mail e sem senha. O e-mail digitado fica só no `Agendamento.emailLembrete`.
  - A conta nova prova o e-mail e acha o telefone num cadastro sem esse e-mail. Aí recusa com `telefone_ja_cadastrado`.
- **Juntar só pelo telefone não é seguro.** O telefone nunca é provado: o código só sai por e-mail, e o WhatsApp está desligado (ADR-0009). Juntar pelo número entregaria o histórico de alguém a quem soubesse o número dessa pessoa.

## O que o dono decidiu (06/11)
- Recusou "exigir conta pra agendar". Motivos:
  - mais atrito no agendamento;
  - o telefone continuaria sem prova;
  - o cliente do balcão ficaria travado.
- Aprovou A + B + C. A API junta o cadastro do telefone à conta nova só com prova:
  - **A**: todos os horários do cadastro foram marcados pela página com o e-mail que acabou de ser provado.
  - **B**: o "Criar conta" da tela de sucesso leva a prova de que foi esta pessoa quem marcou, e o cadastro nasceu nesse agendamento (é o único horário dele).
  - **C**: fora disso, a tela explica e oferece "Pedir pelo WhatsApp", com a mensagem pronta pra barbearia incluir o e-mail no cadastro, e "Usar outro telefone".
- Telas aprovadas:
  - **Entrar**: "Esqueci minha senha" junto da senha, e "Primeira vez aqui?" com o botão Criar conta.
  - **Recuperar senha**: tela própria.
  - **Criar conta**: nome, telefone e e-mail, depois código e senha, depois conta pronta ou telefone com histórico.
  - **Tela de sucesso sem conta**: chamada "Prefere não guardar link?".

## Decisões deste plano
- **Condições para juntar** (`podeJuntar` em `auth-cliente.ts`):
  - o cadastro não tem senha, e-mail nem assinatura;
  - tem ao menos um horário, porque "todos batem" num conjunto vazio é verdade à toa;
  - na A, todos os horários têm origem `cliente` e o `emailLembrete` normalizado igual ao e-mail provado.
- **Uma resposta só**: qualquer motivo de recusa responde o mesmo `telefone_ja_cadastrado`.
- **Gravação**: conferência e gravação na mesma transação. O nome do cadastro fica como está, e a resposta é 200, como para um cadastro que já existia.
- **O token da B não é o link do horário** (sugestão do revisor). O link vai pro WhatsApp e pra agenda e é feito pra ser repassado; como prova de conta, deixaria quem visse a mensagem prender o telefone ao e-mail dele. Por isso:
  - `POST /barbearias/:slug/agendamentos` devolve também `tokenDaConta`, um JWT do tipo `conta_do_agendamento` que vale 1 hora;
  - a tela guarda esse token só na aba (`sessionStorage`), nunca em URL;
  - ele vai no corpo de `/auth/cliente/senha`;
  - os hooks do painel, da conta do cliente e do lembrete exigem o tipo deles, então este token não autentica nada além disso.
- **Recuperar senha** continua pedindo nome e telefone no segundo passo, porque a rota da API exige os dois.
- **Tela de sucesso**: o cartão salvo passa a guardar também `nome`, `email` e `tokenDaConta`, para o Criar conta chegar preenchido. O cartão é apagado só quando a conta é criada.
- **Telefone trocado**: se a pessoa muda o telefone no Criar conta, o token não vai.
- **No computador**, o "Esqueci minha senha" fica embaixo do campo da senha, e os botões fora do formulário ficam na largura deles.
- **Limite conhecido**: enquanto o telefone não é provado, quem cria conta primeiro com um número fica com os próximos agendamentos desse número. Isso já era assim antes. Quando o código passar a sair pelo WhatsApp, juntar pode ser direto.

## Feito (06/11)
- Branch `criar-conta-do-cliente`.
- Testes:
  - API: 1471, suíte inteira, com o arquivo novo `auth-cliente-juntar.test.ts` (14 casos);
  - api-client: 242;
  - web: 1737.
- tsc e eslint limpos.
- Conferido no navegador (semente + `URL_DO_PAINEL`), em 390 escuro, 360 claro e 1440:
  - o agendamento sem conta mostra a chamada;
  - o "Criar conta" abre o formulário preenchido, com o token guardado na aba;
  - o código é pedido.
- Ponta a ponta contra a API de verdade (banco `_test`, código trocado direto no banco porque o script local não loga):
  - agendar sem conta com e-mail → Criar conta → "Conta criada" com o horário junto;
  - agendar sem e-mail e criar a conta com outro e-mail, sem o token → "Esse telefone já tem histórico aqui", com o link do WhatsApp pronto.
- **Ordem do deploy**: API antes da web (ou junto). O corpo de `/auth/cliente/senha` tem `additionalProperties: false`, então a API velha recusa o `tokenDaConta` com 400.
