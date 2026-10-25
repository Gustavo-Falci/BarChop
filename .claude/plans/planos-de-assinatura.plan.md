# Plan: Planos de assinatura para o cliente

**Source PRD**: `.claude/prds/onda-2-dinheiro.prd.md`
**Selected Milestone**: 3 — Planos de assinatura para o cliente
**Complexity**: Large (12 PRs, 1 migração no PR 2)
**Status**: aprovado pelo dono em 2026-10-24, com as decisões propostas como estão; próximo: PR 1

Diferenças do plano, combinadas no caminho:
- **PR 1:**
  - o `dividirPagamento` não mudou. O avulso de um atendimento pelo plano é o `servicosCentavos` de sempre e se divide como hoje;
  - o que o plano gera sai de funções à parte: `parteDoPlano` (o fixo) e `dividirMensalidade`, que devolve as partes da mensalidade em vez de só o valor da casa;
  - a API junta as partes no `acertoDoDia`, cada uma com o seu `recebidoPor`;
  - os motivos novos ficam em `MOTIVOS_DO_PLANO`, fora do `MOTIVOS_DA_PARTE`. Se fossem para a lista do caixa agora, o `banco-caixa.test.ts` gravaria motivos que o CHECK ainda recusa. O PR 2 põe o `plano` no CHECK de `pagamento_parte`;
  - `Parte` ganhou o motivo como parâmetro de tipo, para o `dividirPagamento` seguir devolvendo só os motivos do caixa.
- **PR 1b (correção, 24/10):**
  - o `acertoDoDia` aceita `recebidoPor: null` (a casa paga) e `Repasse.de` nulo, e `RepasseDoCaixa.de` em `@barchop/types` ficou anulável;
  - a API, o dublê e a tela do Caixa escrevem "A casa repassa…";
  - achado ao desenhar a tela do Caixa no Claude Design (https://claude.ai/artifact/4hgca1aVpddptUxnUssWTG).
- **PR 2 (migração):**
  - **tabela nova `uso_do_plano`**: um registro por serviço coberto num atendimento pelo plano, com `pagamento_id` (sai junto com o pagamento, então desfazer devolve o uso), `assinatura_id`, `servico_id` e `data`. Sem ela, o `assinatura_id` do pagamento não dizia qual serviço foi pelo plano e qual foi cobrado à parte, e o "Corte 1 de 2" não tinha de onde sair;
  - **sem `pagamento.avulso_centavos`**: a `forma` segue sendo a do dinheiro, e `servicos_centavos` é o que foi cobrado à parte, como o PR 1 já deixou. `plano` só vale para o atendimento todo pelo plano, sem dinheiro (CHECK: assinatura preenchida, serviços e gorjeta zero). Com `forma = plano` e dinheiro dentro, o total por forma do caixa perderia esse dinheiro. "Pelo plano" na tela = `assinatura_id` preenchido;
  - chaves para membro, cliente, plano e assinatura são `NO ACTION`, não `RESTRICT`, como no caixa: com RESTRICT, apagar a barbearia (que leva os membros na mesma cascata) falharia;
  - o UNIQUE `(barbeiro_id, provedor)` é parcial (`WHERE NOT da_casa`), para o dono ter a conta da casa e a dele;
  - o UNIQUE da cobrança no provedor é `(assinatura_id, id_externo)`;
  - novos: `assinatura_do_cliente` com uma viva (não cancelada) por cliente e plano; `ciclo_comeca_em`/`ciclo_termina_em` nulos enquanto pendente; `recebimento_do_plano.forma` com CHECK de `FORMAS_DE_PAGAMENTO`; `evento_do_provedor.tipo`;
  - listas novas em `@barchop/formato`: `PROVEDORES_DE_PAGAMENTO` (`asaas`) e `MODOS_DA_CONEXAO` (`teste`, `real`);
  - o teste é `apps/api/tests/banco-planos.test.ts`, ao lado do `banco-caixa.test.ts`.
- **PR 3 (API dos planos):**
  - as rotas ficaram em `routers/planos.ts`; o `lib/planos-do-cliente.ts` nasce quando o balcão e o caixa (PRs 5 e 6) precisarem ler plano e assinatura;
  - a recepção vê todos os planos (o balcão e o caixa usam), sem criar nem mudar;
  - o `GET` diz também `podeCriarDaCasa` e `podeCriarProprio`, pra tela não refazer a regra;
  - plano de barbeiro só cobre serviço que o vendedor faz (`servico_fora_do_vendedor`), e quem não atende não vende plano próprio (`vendedor_nao_atende`);
  - cada problema do `problemaDoPlano` tem o seu código (`plano_preco`, `plano_fixo`…);
  - desativar com assinantes vale em qualquer plano do BarChop, porque no Grátis as assinaturas do cliente seguem valendo;
  - mudar os serviços ou os usos de um plano vale na hora, também para quem já assina (preço e ciclo ficam congelados na assinatura). O dono decidiu (24/10, no #207) **não** recusar tirar serviço de plano com assinantes vivos.
- **PR 4 (vitrine pública):**
  - fora do Completo ou com a vitrine desligada, `GET /barbearias/:slug/planos` devolve lista vazia, nunca 403: a página não quebra nem conta qual plano do BarChop a barbearia paga. `temORecurso` em `lib/assinatura.ts` é o `garantirRecurso` sem o 403;
  - **plano só online sem a conta de quem vende conectada fica fora da vitrine**; online e no balcão, sem a conta, entra só no balcão (`aceitaOnline: false`). Até o PR 9 (conectar a conta) só aparecem planos que aceitam o balcão;
  - a conta que recebe: a da casa pro plano da casa, a pessoal do vendedor pro dele (`temContaQueRecebe`, em `lib/planos-do-cliente.ts`; o PR 10 usa a mesma regra);
  - serviço desativado sai da lista do plano, e plano sem serviço ativo sai da vitrine;
  - sem o fixo da casa, quantos assinam e o `ativo`.
- **PR 5 (assinante no balcão):**
  - as rotas ficaram em `routers/assinantes.ts`. `GET /barbearias/me/assinantes` aceita também `?clienteId=`, pro detalhe do cliente;
  - **sem tarefa diária na fila**: a fila não tem trabalho recorrente, e o `em_atraso` é marcado na leitura (`marcarAtrasadas`), no dia seguinte ao da renovação (`cicloEmAtraso`, no `formato`). Consequência: o atraso do balcão não avisa ninguém (ver PR 10);
  - o ciclo vai de `ciclo_comeca_em` até o dia da renovação, `ciclo_termina_em` (mensal de 24/10 renova em 24/11);
  - **o "recebi" abre um ciclo novo a partir de hoje** (`problemaDoRecebimento`, no `formato`):
    - pendente, em atraso, ou no dia da renovação em diante: vale;
    - antes do dia da renovação (ativa ou em teste): 422 `ciclo_em_dia`. Guardar um ciclo que começa no futuro tiraria os usos de hoje da conta. Pagar adiantado pediria uma coluna nova (`pago_ate`), numa migração;
    - pagar atrasado recomeça o ciclo no dia do pagamento: o dia da renovação anda;
  - assinar com dias grátis nasce `teste`, de hoje até hoje + dias; sem dias grátis, `pendente` e sem ciclo, até o 1º "recebi";
  - a parte da casa usa a "parte da casa" de hoje do vendedor; o dia do caixa é o próximo aberto, e o ciclo segue o dia do pagamento;
  - só assinar exige o Completo; a lista, o "recebi" e o cancelar seguem no Grátis (decisão 6).
- **PR 6 dividido em dois:**
  - **6a: "pelo plano" no pagamento.** Pagamento e `GET` do pagamento.
  - **6b: mensalidades no caixa.** Os recebimentos no acerto, nos totais e na foto do fechamento.
- **PR 6a (pelo plano no pagamento):**
  - **a tela manda só `assinaturaId`**: a API decide o que o plano cobre. Cada linha do atendimento que o plano tem gasta um uso, até os usos do ciclo. O que passa disso, ou que o plano não tem, é avulso e entra em `servicosCentavos`;
  - **422 quando nada é coberto**: `usos_esgotados`, ou `servico_fora_do_plano`;
  - **outras recusas**: `assinatura_de_outro_cliente`, `assinatura_inativa`, `fora_do_ciclo`, `plano_de_outro_barbeiro`. A assinatura de outra barbearia é 404;
  - **o ciclo vale de `ciclo_comeca_em` até a véspera de `ciclo_termina_em`**: no dia da renovação, o atendimento já é do ciclo seguinte, que só abre com o "recebi";
  - **a forma é recusada (`forma_invalida`), nunca trocada sozinha**:
    - `plano` só sem nada cobrado (serviços e gorjeta zerados) e com assinatura;
    - com assinatura e nada cobrado, só `plano`;
  - **refazer com a mesma assinatura não confere de novo**: ficam os mesmos usos e vale o fixo de agora. Assim o ciclo renovado ou o cancelar não travam a correção de um pagamento antigo. Trocar ou tirar a assinatura refaz os usos;
  - **no acerto, a parte `plano` é a casa pagando quem atendeu** (`recebidoPor: null`), separada do dinheiro;
  - **o `GET /agendamentos/:id/pagamento` traz `assinaturas`**, com os usos que sobram no ciclo sem os deste pagamento, `noCiclo` e `valeComOAtendente`. O profissional recebe os planos da casa e os dele;
  - **o 422 desfaz a transação, e com ela a marca de em atraso**. A próxima leitura marca de novo;
  - **web**: só o mínimo pra compilar ("Pelo plano" nos rótulos da forma). A tela é o PR 7.
- **PR 6b (mensalidades no caixa):**
  - **o acerto divide a mensalidade pelo que foi congelado no "recebi"**: `casa_centavos` pra casa, o resto pra quem vende. Não chama `dividirMensalidade` de novo, porque a parte da casa pode ter mudado;
  - **uma função só conta o acerto**: o caixa aberto e a foto do fechamento usam a mesma. Os pagamentos vêm na ordem do dia e as mensalidades depois, por `registrado_em` e id;
  - **as mensalidades entram nos totais por forma**, em quantidade e valor. Sem isso, o total do dia não bate com o dinheiro que cada um segura;
  - **`CaixaDoDia.mensalidades`** traz `registradoEm`, pra tela mostrar "recebido em" quando o dia do caixa é outro. O profissional vê as que recebeu ou dos planos dele;
  - **teste ponta a ponta**: o "dia da tela Caixa" do PR 1b, montado pelas rotas, dá os mesmos repasses: Gustavo → casa 14700, casa → Lucas 1900.
- **PR 7 dividido em três**, cada um com só os métodos do api-client e o comportamento do dublê que usa:
  - **7a**: a lista de planos com a vitrine, o cadastro do plano, "Planos" na barra, o convite fora do Completo, e no membro o "Pode vender planos" e a confirmação do desativar;
  - **7b**: a aba Assinantes, e no detalhe do cliente "Assinar plano" e "Recebi";
  - **7c**: "Pelo plano" na tela de pagamento e as mensalidades no Caixa.
- **PR 7a (planos no painel):**
  - **o "Online, na página" fica desligado** no cadastro, com a frase "chega com os pagamentos online", e "No balcão" já vem marcado. Liga no PR 9. A tela manda as duas formas sempre, porque o padrão da API é `aceitaOnline: true`;
  - **sem o resumo do mês** ("Outubro, mensalidades recebidas R$ 1.710,00"): não há rota que o devolva. Ele volta quando houver relatório de mensalidades;
  - **os serviços do plano em "2× Corte, Barba sem limite"**, e não "2 cortes e 1 barba": o nome do serviço é texto livre do dono, e pluralizar erraria;
  - **ilimitado esconde o número de usos**: a caixa vazia e apagada parecia campo esquecido;
  - **plano de barbeiro sem número da casa na frase do efeito**: a parte da casa de cada um só o dono vê (`/divisao`). A frase diz que a casa fica com a parte da casa, como no avulso;
  - **o plano de barbeiro só oferece os serviços que o vendedor faz** (`GET /equipe/:id/servicos`, aberto a todos os papéis);
  - **"Planos" na barra pra todos os papéis**, depois do Caixa. No celular fica atrás do "Mais";
  - **o texto não supõe gênero**: "De Gustavo", "vale só com quem vende", "planos próprios". A frase do 422 `assinaturas_ativas` da API ainda diz "dele"; a tela não repete;
  - **desativar membro com assinante** pede confirmação na Situação, e o "Desativar e cancelar as assinaturas" reenvia com `cancelarAssinaturas: true`.
- **PR 7b (assinantes no painel):**
  - **Planos e Assinantes são abas da mesma tela** (`/painel/planos`), sem rota nova. A lista vem inteira de uma vez e filtra na tela: as contagens das pílulas ("Em atraso 2") precisam dela. "Todas" são as que não foram canceladas; as canceladas têm o filtro delas;
  - **fora do Completo, a aba Assinantes continua**: o convite fica só no lugar dos planos, e a aba aparece quando há assinatura viva. Sem assinatura, só o convite, como no 7a. No detalhe do cliente, some o "Assinar plano" e o "Recebi" e o cancelar seguem (decisão 6);
  - **sem a coluna "Usos neste ciclo"** do canvas: `AssinaturaDoPainel` não traz usos, e só o `GET` do pagamento os conta. Volta quando a lista tiver os usos;
  - **sem o "Assinar no balcão" no topo da aba**: pediria escolher o cliente ali. Assinar fica no detalhe do cliente, e a aba vazia leva pra Clientes;
  - **sem "Reenviar cobrança"**: é do online, que não existe antes do PR 10;
  - **o "Recebi" só aparece quando a API o aceitaria** (`problemaDoRecebimento` do `formato`): no balcão, pendente, em atraso, ou do dia da renovação em diante. Numa janela, pergunta a forma (sem "Pelo plano") e diz em que caixa entrou: "no caixa de 25/10" quando hoje já fechou;
  - **o assinar só oferece o que a API aceitaria**: plano ativo, no balcão, e que o cliente ainda não tem. A frase diz o que vem: "Começa com 7 dias grátis, até 31/10" ou "Fica pendente até o primeiro Recebi";
  - **cancelar pede confirmação** ("o plano deixa de valer nos atendimentos a partir de agora") e a assinatura sai da lista do cliente;
  - **o dublê não lança a mensalidade no caixa dele**: o Caixa com mensalidades é o 7c (feito lá).
- **PR 7c (o plano no caixa):**
  - **o plano que vale vem escolhido** no "Usar o plano", com "Não usar: cobrar tudo avulso" ao lado. Esquecer de marcar cobraria o assinante. Trocar a escolha refaz o valor com o que é avulso nela;
  - **a tela espelha o `conferirOPlano`** (`painel/pelo-plano.ts`): cada linha do atendimento que o plano tem gasta um uso, até os do ciclo. A linha diz "Pelo plano · 2º uso de 2 no ciclo", "Pelo plano · sem limite no ciclo" ou "Fora do plano · avulso". Sem o "4º uso" do ilimitado do canvas: `usosRestantes` do ilimitado é `null`, e o GET não conta os usados;
  - **os planos que não valem dizem por quê**, numa frase: de outro barbeiro ("vale só nos atendimentos de Gustavo", sem supor gênero), em atraso, pendente, fora do ciclo, usos acabados, serviços fora do plano. Sem nenhum que valha, "Este atendimento é avulso.";
  - **nada cobrado (nem gorjeta) manda `forma: "plano"`**, sem quem recebeu: as pílulas da forma dão lugar a "Nada a cobrar". Com valor ou gorjeta, a forma volta. É a regra da API, e a tela não deixa mandar a combinação recusada;
  - **editar um pagamento pelo plano mantém a assinatura gravada**, escolhida, com o que ela cobriu (`servicosPeloPlano`), mesmo cancelada ou de outro ciclo. O GET não a traz mais, e sumir com ela regravaria tudo avulso e soltaria os usos;
  - **sem o valor do fixo antes de registrar**: `AssinaturaNoPagamento` não traz o fixo, e `GET /planos` é do Completo e do vendedor. A frase do canvas ("ganha R$ 25,00 do plano da casa") fica no resumo, depois de gravado, com o valor das partes;
  - **o resumo separa o fixo do dinheiro**: "Gustavo fica com R$ 30,00. Gustavo ganha R$ 25,00 do plano da casa, que a casa repassa no acerto." Somado, diria que Gustavo tem 55 na mão. Pelo plano, "Pago pelo plano X: Corte." sem quem recebeu; plano de barbeiro sem nada a cobrar, "A mensalidade já pagou este atendimento: não há o que dividir.";
  - **no Caixa, as mensalidades ficam embaixo dos pagamentos**, na mesma coluna, só quando há. A linha leva ao cliente, com a hora do "Recebi" no fuso da barbearia, de quem é o plano, quem recebeu, o dia quando o "Recebi" foi noutro dia, e a parte da casa nos planos de barbeiro. Sem "Asaas, cartão" do canvas: é do online (PR 10);
  - **o atendimento pelo plano diz o que o plano cobriu** ("· Corte pelo plano"), e a nota "não entra como dinheiro do dia" só aparece quando há um assim. Sem o chip "Pelo plano" e o "(+ R$ 25,00 ao Lucas)" do canvas: o acerto já mostra o repasse da casa;
  - **o dublê conta como a API**: as assinaturas no GET do pagamento, o "pelo plano" com as recusas, o "Recebi" guardado e o caixa com o fixo como a casa pagando e as mensalidades nos totais e no acerto.
- **PR 8 (a cifra e o conector do Asaas), conferido no sandbox em 24/10:**
  - **o CPF é exigido na cobrança, não no cadastro**: o Asaas cria o cliente sem CPF (200), mas recusa a assinatura dele ("Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente."). A decisão 8 vale: o CPF é pedido no checkout (PR 10) e Privacidade e Termos ganham o trecho (PR 12). O conector já pede `cpfCnpj` ao criar o cliente;
  - **pagar a fatura no cartão guarda o cartão na assinatura**: a assinatura criada como `UNDEFINED` virou `CREDIT_CARD`, com o token do cartão, e a cobrança ficou `CONFIRMED`. Isso mostra o cartão guardado; a cobrança automática do mês seguinte não foi vista (vence em 24/11). O primeiro cartão fictício (4111…) falhou calado, e a página voltou para "Aguardando"; o Mastercard de teste passou;
  - **a assinatura vai sem `callback`** (a volta para a Minha conta depois de pagar): o Asaas recusa a assinatura inteira quando a conta do vendedor não tem um site cadastrado, e isso é da conta dele. Depois de pagar, o cliente fica na fatura do Asaas; o BarChop sabe pelo webhook. O "volta para a Minha conta" do PR 10 vira um link nosso, não um redirecionamento do Asaas;
  - **a primeira cobrança sai ao criar a assinatura com vencimento hoje**, e o `nextDueDate` já é o do ciclo seguinte. O link da fatura é o `invoiceUrl` dessa primeira cobrança (`GET /subscriptions/{id}/payments`);
  - **a cobrança no cartão chega `CONFIRMED` sem `paymentDate`** (o dinheiro cai no `creditDate`, 30 dias depois): o dia pago é o `clientPaymentDate`;
  - **o id do webhook é um UUID** (36 caracteres; `id_externo_webhook` tem 100). Apagar o webhook já apagado dá 404; apagar a assinatura já apagada dá 200 de novo. Os dois tratados como feitos;
  - **a resposta do webhook devolve o `authToken` em texto**: nenhuma resposta do provedor vai para log (vale no PR 9);
  - **os prefixos**: `$aact_hmlg_` e o 401 `invalid_environment` da chave do sandbox no endereço de produção conferidos; `$aact_prod_` só pela documentação;
  - **o id da cobrança é o código da fatura pública** (`pay_X` → `/i/X`, que mostra nome, CPF e e-mail de quem vende): as respostas gravadas nos testes trocam ids de cobrança, links e token do cartão por exemplos. Os eventos do webhook não foram gravados (nenhum foi entregue): o envelope é o da documentação;
  - **o modo aceito pela plataforma vem de `PAGAMENTOS_ONLINE_MODO`** (`teste` ou `real`; sem ela, `real` em produção e `teste` fora), e não do `NODE_ENV`: o teste ponta a ponta de um dia na VM usa chave do sandbox na API de produção;
  - **recusar subir em produção sem a `CHAVE_DE_CIFRA` fica para o PR 9**, junto com as rotas que a usam. Até lá, ela só é lida ao usar uma conexão gravada.
- **PR 9 (conectar a conta):**
  - **a API não sobe em produção sem a `CHAVE_DE_CIFRA`** (nem com ela fora de 32 bytes): o adiado do PR 8;
  - **o webhook vai para a `URL_DA_API`** (`/webhooks/asaas/<conexão>`). Sem ela, conectar responde 503 `pagamentos_online_sem_endereco`, e a API sobe. O Asaas recusa `localhost` ("A url informada é inválida."): em desenvolvimento, conectar pede um túnel https. Deploy: `CHAVE_DE_CIFRA` **e** `URL_DA_API` (https) no `infra/api.env` da VM antes deste PR;
  - **`?daCasa=true`, não `=1`**: o AJV só converte `true`/`false` em booleano;
  - **desconectar desliga em vez de apagar** (migração `20261027120000_conexao_desligada`, `desconectada_em`): a assinatura online cancelada segue apontando para a conexão em que foi cobrada (CHECK `online ⇔ conexao_id`), e a chave estrangeira não deixa apagar. A chave cifrada sai do banco; os índices de "uma por barbearia" e "uma por membro" valem só entre as ligadas, e dá para conectar de novo;
  - **trocar a chave só vale com chave da mesma conta**: a nova precisa enxergar o webhook gravado (`GET /webhooks/{id}`: 200 na mesma conta, 404 em outra, conferido no sandbox). Mantém webhook e token. Outra conta é 422 `outra_conta` ("desconecte antes"): mudar de conta deixaria as assinaturas da antiga sem webhook. Lacuna: se o vendedor apagou o webhook à mão no Asaas, a troca recusa mesmo na mesma conta;
  - **a recusa com assinatura viva (422 `assinaturas_ativas`) diz quantas, sem a lista**: o erro da API só tem `erro` e `mensagem`. A tela (PR 11) mostra quem pela lista de assinantes;
  - **ver e desconectar não pedem o Completo nem o "pode vender"**: no Grátis, ou sem a liberação, as assinaturas que existem seguem, e quem vendeu precisa enxergar e soltar a conta. Conectar pede os dois (o dono não precisa da liberação);
  - **o e-mail do webhook é o de quem conectou**: o Asaas avisa ali quando a fila de eventos para;
  - **fumaça no sandbox** com o conector de verdade: o token gerado aqui (43 caracteres, base64url) é aceito; registrar, ver, apagar e apagar de novo passam;
  - **a vitrine só conta conta ligada e do modo aceito**: a conta do sandbox do teste ponta a ponta não vende depois que o modo volta a `real` (decisão 10);
  - **fica para o PR 10**:
    - o webhook só aceita conexão ligada (`desconectadaEm: null`) e do modo aceito. A desligada guarda o hash do token, mas não tem mais a chave: conexão desligada é desconhecida (200 + log), senão o `daConexao` lança e o Asaas repete até parar a fila;
    - o assinar relê a conexão ligada e do modo aceito dentro da própria transação: o desconectar conta as assinaturas vivas e desliga sem trava, e os dois não podem se cruzar.
- **PR 10 dividido em três** (dono, 25/10), cada um em produção antes do próximo. Nada que cria assinatura online vai ao ar antes de existir quem recebe o pagamento e quem cancela no provedor:
  - **10a: a migração e o webhook** (o lado que recebe), mais as três variáveis no `infra/api.env.example`;
  - **10b: cancelar no provedor pelo painel** (desativar membro com `cancelarAssinaturas` e o `DELETE /assinaturas/:id`), e a frase "dele" do 422 `assinaturas_ativas`;
  - **10c: assinar online**, "minhas assinaturas" e o cancelar do cliente, com o CPF.
- **PR 10a (webhook e mensalidade online), decisões do dono em 25/10:**
  - **a mensalidade online tem a forma `online`** (`FORMAS_DA_MENSALIDADE`), com o `meio` do provedor (`pix`, `cartao`, `boleto`, `outra`). Os totais do caixa ganham a 5ª linha "Online": o total do dia é tudo que entrou. A tela só mostra a linha quando há;
  - **o sino "Nova assinatura" sai no primeiro pagamento**, e não ao assinar: pendente que nunca paga é ruído. "Pagamento em atraso" e "Pagamento estornado" também vão a quem vende (os donos no plano da casa, o vendedor no dele), com link pro cliente;
  - **estorno não mexe no caixa** (o dia pode estar fechado): sino e log, e quem vende acerta à mão;
  - **migração única `20261028120000_mensalidade_online`**: `recebido_por_id` anulável (só na online; nulo = a casa, no plano da casa), `meio`, `pago_ate` e `cliente.cpf` (11 dígitos, usado no 10c);
  - **o ciclo online segue o vencimento da cobrança**, como no Asaas: paga atrasada, o ciclo começa no vencimento. **Paga antes da renovação** (Pix adiantado, ou durante o teste grátis), o ciclo de agora segue, e o pago fica em `pago_ate` até o atual acabar. Quem rola é o `marcarAtrasadas`, na leitura, sem tarefa agendada (`cicloPagoOnline`, no `formato`);
  - **o atraso só vem da cobrança da renovação**: a vencida de um ciclo velho, a já paga ou com `pago_ate` não derruba o ciclo;
  - **o cabeçalho do token é `asaas-access-token`** (documentação do Asaas). Token errado é 401; conexão desligada, de outro modo ou desconhecida é 200 + log, sem gravar o evento;
  - **o mesmo pagamento entra uma vez**: o CONFIRMED do cartão e o RECEIVED são eventos diferentes da mesma cobrança, e o recebimento é conferido pelo `id_externo` antes de gravar, com a linha da barbearia travada;
  - **assinatura removida, inativa ou expirada no provedor fica cancelada aqui**. Cobrança paga numa assinatura cancelada no BarChop só vai pro log.

## Summary
A barbearia e cada barbeiro liberado pelo dono criam planos de assinatura: ciclo, preço, dias de teste e serviços incluídos com limite de usos por ciclo. A página pública mostra esses planos numa vitrine. O cliente assina e paga online pelo Asaas, com o dinheiro na conta de quem vende, ou combina o pagamento no balcão.

Quando o assinante é atendido, o painel registra o atendimento "pelo plano" no caixa. Assim:
- o uso é contado;
- no plano da casa, quem atendeu ganha o valor fixo;
- a mensalidade recebida entra no acerto do dia com a parte da casa.

O caminho sem provedor (planos, vitrine, assinante "no balcão", "pelo plano" no caixa) sai primeiro. O Asaas entra por cima, num conector que depois recebe o Mercado Pago e a Stripe.

## Decisões do dono (24/10, antes do plano; gravadas no PRD)
- **Dois tipos de plano.** Há planos **da casa** e planos **de barbeiro**. O dinheiro cai na conta de quem vende.
- **Plano de barbeiro:**
  - vale só com aquele barbeiro;
  - com outro barbeiro, o atendimento é avulso e entra no caixa como hoje;
  - a casa fica com o mesmo % da "parte da casa" do barbeiro sobre a mensalidade recebida, cobrado no acerto.
- **Plano da casa:**
  - vale com qualquer profissional;
  - quem atende ganha um **valor fixo por atendimento**, definido no plano;
  - no acerto, a casa deve esse valor a quem atendeu.
- **Quem vende.** O dono sempre vende. Cada profissional só vende se o dono ligar "pode vender planos" para ele. Quem vende conecta a própria conta no provedor.
- **Provedores.** Cada provedor tem um conector. O primeiro é o **Asaas**: o vendedor cola a chave de API, e o BarChop cria o webhook pela API com um `authToken` próprio. O Pix Automático fica como extra.
- **Provedores futuros (fora deste plano).** Entram depois, cada um como um conector:
  - **Mercado Pago:** conferir se o app OAuth sai com CPF.
  - **Stripe Connect:** só cartão recorrente.
  - **InfinitePay** (pedido do dono em 24/10), no modo **"link por ciclo"**:
    - a API pública não cria assinatura, só link de checkout (Pix ou cartão) e a consulta `payment_check`;
    - a cada ciclo, o BarChop gera o link e manda ao assinante;
    - o webhook `payment_approved` não é assinado, então todo pagamento é confirmado no `payment_check` antes de valer;
    - o cartão não é cobrado sozinho.

    Até esse conector existir, quem usa os Planos do app da InfinitePay registra o assinante como "no balcão" e marca "Recebi" a cada ciclo.

    Fontes: [checkout](https://www.infinitepay.io/checkout-documentacao), [planos e assinaturas](https://www.infinitepay.io/recorrencia-assinatura).
- **O BarChop não cobra taxa** sobre essas vendas (PRD).

## Decisões propostas (confirmar ao aprovar o plano)
1. **Em qual plano do BarChop.** Os dois tipos ficam no recurso `planosDaBarbearia`, que hoje só existe no Completo (`planos.ts:68`). Nenhuma mudança de preço.
2. **Onde o uso é contado: no caixa, não no agendamento.**
   - A página pública agenda sem login (nome e telefone), então não prova quem está agendando.
   - O uso conta quando o painel registra o pagamento com a forma **"Pelo plano"** (PR 6). Ali a API confere:
     - assinatura `ativa`;
     - serviço incluído e com uso sobrando no ciclo;
     - no plano de barbeiro, que quem atendeu é o vendedor.
   - **Diferença da prévia que o dono viu:** a mensagem "Seu plano vale só com Gustavo" não aparece ao agendar. Ela aparece no painel, na hora de registrar. Mostrar a mensagem ao agendar, para o cliente logado, fica para depois.
3. **Atendimento pelo plano, no caixa:**
   - registra `forma = "plano"`, com o valor dos serviços cobertos zerado;
   - serviço fora do plano, ou uso que passou do limite, é cobrado à parte no mesmo pagamento: a `forma` é a do dinheiro, o `servicos_centavos` é o que foi cobrado à parte e se divide pelas regras de hoje; `forma = "plano"` só no atendimento todo pelo plano, sem dinheiro. Os serviços cobertos viram linhas de `uso_do_plano` (corrigido no PR 2: a primeira versão tinha um campo de valor avulso);
   - **no plano de barbeiro**, a parte "pelo plano" não gera nada: o barbeiro já recebeu a mensalidade;
   - **no plano da casa**, gera a parte `plano` para quem atendeu, no valor fixo, paga **pela casa** (`recebidoPor: null` no acerto). O fixo sai do dinheiro da casa, não do bolso de quem segura a mensalidade. O `acertoDoDia` mostra "A casa repassa R$ 25 para o Parceiro", já compensado com o que o Parceiro deve à casa. (Corrigido no PR 1b: a primeira versão punha o membro da conta da casa como `recebidoPor`, e ele pagava o fixo do bolso);
   - gorjeta segue a regra de hoje: 100% para quem atendeu, sobre a forma do pagamento avulso. Atendimento só pelo plano não aceita gorjeta no MVP.
4. **Mensalidade no caixa:**
   - cada mensalidade recebida (webhook do Asaas, ou "recebi no balcão" marcado no painel) vira uma linha de `recebimento_do_plano`;
   - a parte da casa é **congelada na hora**, como as partes do caixa:
     - no plano de barbeiro: preço × `parteDaCasa` do vendedor, arredondado para baixo;
     - no plano da casa: 100% casa;
   - a conta é sobre o **preço do plano (bruto)**, não sobre o líquido da taxa do Asaas: a taxa é custo de quem vende;
   - o dia do caixa é o dia em que o pagamento foi confirmado. Se esse dia já estiver fechado, o recebimento entra no **próximo dia aberto** e o Caixa mostra "recebido em DD/MM";
   - o `GET` do caixa soma os recebimentos ao acerto (`acertoDoDia` já só pede `recebidoPor` e partes).
5. **Situações da assinatura do cliente:** `pendente` (esperando o 1º pagamento), `teste`, `ativa`, `em_atraso`, `cancelada`.
   - Só `ativa` e `teste` usam o plano.
   - Assinante `em_atraso` é atendido como avulso, até o pagamento entrar.
6. **Dinheiro que segue andando no provedor.** Para cada caso, o que o BarChop faz:
   - **A barbearia cai no Grátis (teste vencido ou assinatura do BarChop cancelada):** as assinaturas que existem continuam valendo (são do cliente com quem vende) e o caixa segue contando. Novas vendas e vitrine ficam desligadas. A tela de Planos mostra o convite para o Completo.
   - **Desativar um membro** com assinantes ativos no plano dele: a tela pergunta e **cancela as assinaturas no provedor no mesmo passo**. Sem resposta, não desativa.
   - **Tirar o "pode vender planos"** de quem tem assinantes: os planos dele saem da vitrine e param de aceitar assinante novo. As assinaturas que existem continuam até o fim.
   - **Desconectar a chave do Asaas** com assinaturas vivas: **recusado** (422 `assinaturas_ativas`), com a lista de quem cancelar antes. Sem isso o webhook deixaria de chegar e a cobrança continuaria.
7. **Ciclos do MVP:** mensal, trimestral e anual. Os dias de teste empurram a primeira cobrança.
8. **Checkout do Asaas pela fatura dele (`invoiceUrl`).** O BarChop nunca vê dado de cartão.
   - Assinar exige o cliente **logado** na página pública, porque o login já existe: código + senha, em `auth-cliente.ts`.
   - Se o Asaas exigir CPF para cobrar (conferir no PR 8), o CPF é pedido no checkout e guardado no cadastro do cliente. Nesse caso, Privacidade e Termos ganham o trecho.
9. **"No balcão":**
   - o plano pode aceitar online, no balcão ou os dois;
   - assinante no balcão é cadastrado pelo painel, no detalhe do cliente;
   - cada ciclo é marcado "recebi" à mão, com a forma, e vira um recebimento do item 4;
   - ciclo sem "recebi" deixa a assinatura em `em_atraso` no dia seguinte ao vencimento.
10. **Chave do Asaas:**
    - cifrada no banco com AES-256-GCM, com a chave `CHAVE_DE_CIFRA` do ambiente. A API não sobe em produção sem ela, como com o `JWT_SECRET`;
    - nunca volta para a tela: a tela só mostra os 4 últimos caracteres;
    - o `authToken` do webhook é gerado pelo BarChop, guardado só como hash e conferido com `timingSafeEqual`;
    - chave de sandbox é recusada em produção e vice-versa, como o `modoDaChave` da Stripe.

## Modelo (PR 2, migração `20261026120000_planos_de_assinatura`)
- `barbeiro.pode_vender_planos`: `BOOLEAN`, padrão `false`. O dono vende sem precisar dela.
- `barbearia.vitrine_de_planos`: `BOOLEAN`, padrão `false`.
- `conexao_de_pagamento`: a conta de um vendedor num provedor.
  - `id`, `barbearia_id`, `barbeiro_id` (quem conectou) e `da_casa` (`BOOLEAN`: a conta que recebe os planos da casa; UNIQUE parcial com uma por barbearia);
  - `provedor` (CHECK `asaas`) e `modo` (`teste` | `real`);
  - `chave_cifrada` (`BYTEA`), `chave_final` (4 caracteres) e `webhook_token_hash`;
  - `id_externo_webhook`, `criado_em`;
  - UNIQUE parcial `(barbeiro_id, provedor) WHERE NOT da_casa` para as contas de barbeiro (o dono pode ter a da casa e a dele).
- `plano_de_assinatura`:
  - `id`, `barbearia_id` e `vendedor_id` (anulável: nulo = da casa; `ON DELETE NO ACTION`, como as chaves de membro do caixa);
  - `nome`, `descricao`, `ciclo` (CHECK), `preco_centavos`, `dias_de_teste` (0 a 30);
  - `fixo_por_atendimento_centavos` (só no da casa; CHECK nulo quando é de barbeiro);
  - `aceita_online`, `aceita_no_balcao`, `ativo`, `ordem`, `criado_em`.
- `plano_servico`: `plano_id`, `servico_id` e `usos_por_ciclo` (nulo = ilimitado). Chave primária no par.
- `assinatura_do_cliente`:
  - `id`, `barbearia_id`, `plano_id` e `cliente_id`;
  - `situacao` (CHECK) e `forma` (`online` | `no_balcao`);
  - `conexao_id` e `id_externo` (anuláveis no balcão; UNIQUE `(conexao_id, id_externo)`);
  - `ciclo_comeca_em` e `ciclo_termina_em` (`DATE`), `cancelada_em`, `criado_em`;
  - preço e ciclo **congelados** (`preco_centavos`, `ciclo`): mudar o plano vale para assinatura nova.
- `recebimento_do_plano`:
  - `id`, `barbearia_id`, `assinatura_id`, `data` (dia do caixa; índice `(barbearia_id, data)`);
  - `recebido_por_id` (o membro dono da conta, ou quem marcou "recebi");
  - `valor_centavos`, `casa_centavos` (congelado; CHECK ≤ valor) e `forma`;
  - `id_externo` (anulável: a cobrança no provedor; UNIQUE `(assinatura_id, id_externo)`) e `registrado_em`.
- `uso_do_plano`: `id`, `pagamento_id` (`ON DELETE CASCADE`: desfazer o pagamento devolve o uso), `assinatura_id`, `servico_id` e `data` (a do pagamento; índice `(assinatura_id, data)`). Um por serviço coberto; os usos do ciclo são as linhas com `data` dentro do ciclo da assinatura.
- `evento_do_provedor`: `(provedor, id)` como chave primária e `recebido_em`. É a mesma deduplicação do `evento_stripe`.
- `pagamento`:
  - CHECK de `forma` passa a usar a lista nova `FORMAS_DO_CAIXA` = `FORMAS_DE_PAGAMENTO` + `plano`. O `barbearia.formas_pagamento` da página pública **não muda**;
  - ganha `assinatura_id` (anulável). `forma = plano` exige a assinatura e serviços e gorjeta zero (CHECK). Com serviço cobrado à parte, a forma é a do dinheiro.
- `pagamento_parte.motivo` ganha `plano` (o fixo do plano da casa).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Lista fechada + conta pura | `barchop/packages/formato/src/caixa.ts:17`, `planos.ts:11` | constantes `as const` que viram CHECK, funções puras testadas em `packages/formato/tests/`; API e web leem do mesmo lugar (ADR-0007) |
| Conector com dublê | `barchop/apps/api/src/lib/cobranca.ts:156` (`Cobranca`), `:244` (`cobrancaDeMemoria`), `:586` (`cobrancaDoAmbiente`) | interface + implementação de memória + a real; aqui uma **fábrica** na instância (`app.provedores(conexão)`), porque cada vendedor tem a própria chave |
| Webhook | `barchop/apps/api/src/routers/webhook-stripe.ts:15` | o estado é relido no provedor; o evento é gravado na mesma transação da mudança; dado estranho → log + 200; releitura fora da transação, falhou → 500 sem gravar |
| Recurso do plano | `barchop/apps/api/src/lib/assinatura.ts:96` (`garantirRecurso`) | 403 `recurso_do_plano` |
| Erro de negócio | `barchop/apps/api/src/lib/erro-negocio.ts` | `ErroDeNegocio(mensagem, codigo)` → 422; 409 `dia_fechado` |
| Papel | `barchop/apps/api/src/plugins/auth.ts:218` (`exigirPapel`), `:228` (`agendaVisivel`) | planos da casa e "pode vender" = dono; plano próprio = quem tem `pode_vender_planos`; matriz em `tests/routers/auth-papeis.test.ts` |
| Rota protegida da barbearia | `barchop/apps/api/src/routers/caixa.ts:98` | `GET/PUT /barbearias/me/...` |
| Login do cliente | `barchop/apps/api/src/routers/clientes-me.ts:83`, `plugins/auth.ts` (`autenticarCliente`) | rotas `/clientes/me/...` |
| Migração à mão | `migrations/20261017120000_caixa` | SQL com CHECK das listas; `migrate deploy`, nunca `migrate dev` |
| Segredo obrigatório no ambiente | `JWT_SECRET` em `apps/api/.env.example`, `cobrancaDoAmbiente` | sem a variável em produção, a API não sobe |
| Testes de API | `barchop/apps/api/tests/routers/caixa.test.ts`, `pagamento.test.ts` | `buildApp` + `app.inject`, banco de teste, fixtures em `tests/helpers` |
| Testes de tela | `barchop/apps/web/tests/painel/sino-de-notificacoes.test.tsx` | Testing Library + `fetch` falso |
| Telas | memória "telas sem blocos" e "telas horizontais"; `CaixaDoDia.tsx`, `DivisaoDoDinheiro.tsx` | ação principal em destaque, pílulas, Salvar/Descartar só quando muda |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/packages/formato/src/planos-do-cliente.ts` (+ teste, `index.ts`) | CREATE | listas (ciclos, situações, formas), `FORMAS_DO_CAIXA`, `parteDaCasaNaMensalidade()`, `usosNoCiclo()`, `fimDoCiclo()`, validação do plano |
| `barchop/packages/formato/src/caixa.ts` | UPDATE | motivo `plano`; `dividirPagamento` com a parte pelo plano + avulso |
| `barchop/packages/database/prisma/schema.prisma` + migração | UPDATE / CREATE | modelo acima |
| `barchop/apps/api/src/lib/cifra.ts` (+ `.env.example`) | CREATE | AES-256-GCM com `CHAVE_DE_CIFRA` |
| `barchop/apps/api/src/lib/planos-do-cliente.ts` | CREATE | ler plano e assinatura, conferir uso, gravar recebimento (dia aberto) |
| `barchop/apps/api/src/routers/planos.ts` | CREATE | CRUD de planos, vitrine, assinantes, "recebi no balcão" |
| `barchop/apps/api/src/routers/equipe.ts` | UPDATE | `podeVenderPlanos` no PATCH (dono); desativar com assinantes |
| `barchop/apps/api/src/routers/caixa.ts`, `lib/caixa.ts` | UPDATE | forma `plano`, recebimentos no caixa do dia |
| `barchop/apps/api/src/lib/provedores/{index,memoria,asaas}.ts` | CREATE | o conector |
| `barchop/apps/api/src/routers/pagamentos-online.ts` | CREATE | conectar/desconectar a conta |
| `barchop/apps/api/src/routers/webhook-asaas.ts` | CREATE | `POST /webhooks/asaas/:conexaoId` |
| `barchop/apps/api/src/routers/barbearias.ts`, `clientes-me.ts` | UPDATE | vitrine pública; assinar, minhas assinaturas, cancelar |
| `barchop/apps/api/src/app.ts` | UPDATE | rotas e a fábrica de provedores |
| `barchop/packages/api-client` (+ dublê) | UPDATE | métodos novos |
| `barchop/apps/web/src/telas/painel/Planos*.tsx` + rotas `planos/`, `planos/[id]`, `planos/novo` | CREATE | planos e assinantes |
| `barchop/apps/web/src/telas/painel/configuracoes/PagamentosOnline.tsx` + rota | CREATE | conectar o Asaas |
| `barchop/apps/web/src/telas/painel/DetalheDoAgendamento.tsx`, `CaixaDoDia.tsx`, `DetalheDoCliente.tsx`, `DetalheDoMembro` | UPDATE | "Pelo plano", recebimentos, assinar no balcão, "pode vender planos" |
| `barchop/apps/web/src/telas/PerfilDaBarbearia.tsx`, `MinhaConta.tsx` + rota `[slug]/planos` | UPDATE / CREATE | vitrine, assinar, minhas assinaturas |
| `barchop/apps/web/src/painel/NavegacaoDoPainel.tsx`, `novidades.ts`, Central de ajuda | UPDATE | menu "Planos", novidade, perguntas |
| `barchop/apps/web/app/(marketing)/privacidade`, `termos` | UPDATE | chave do vendedor guardada; CPF, se o Asaas pedir |
| `barchop/docs/screens.md`, `docs/roadmap.md`, PRD | UPDATE | telas novas; marco 3 |

## Tasks (um PR por task; TDD com commit RED e depois GREEN)

**Parte A — sem provedor (o marco entrega mesmo se o Asaas surpreender)**

### PR 1: A conta dos planos em `@barchop/formato`
- **Action**:
  - `planos-do-cliente.ts`: listas, `FORMAS_DO_CAIXA`, `parteDaCasaNaMensalidade(preco, parteDaCasa, daCasa)`, `usosNoCiclo(...)` e `fimDoCiclo(inicio, ciclo)`;
  - em `caixa.ts`: motivo `plano` (feito no PR 1 como `MOTIVOS_DO_PLANO` + `parteDoPlano`; o `dividirPagamento` não mudou).
- **Mirror**: `caixa.ts` e o teste dele.
- **Validate**: `pnpm --filter @barchop/formato test`. Casos:
  - plano de barbeiro com 20% de parte da casa;
  - plano da casa com fixo;
  - avulso junto com o plano;
  - arredondamento;
  - ciclos com fim de mês (31/01 + 1 mês);
  - usos ilimitados e esgotados.

### PR 2: Planos no banco (MIGRAÇÃO)
- **Action**: schema e migração do modelo acima.
- **Mirror**: `20261017120000_caixa`.
- **Validate**: `tests/banco.test.ts` (CHECKs, UNIQUE parcial da conta da casa, `RESTRICT` do vendedor, CHECK da `forma` nova) + `migrate deploy` no dev e no teste.
- **Deploy**: precisa do `migrar`.

### PR 3: Planos e "pode vender" (API)
- **Action**:
  - `GET/POST/PATCH /barbearias/me/planos`: casa = dono; o próprio = quem pode vender; o profissional vê os dele;
  - `PATCH /equipe/:id` aceita `podeVenderPlanos` (só o dono);
  - `PUT /barbearias/me/vitrine-de-planos`;
  - 403 `recurso_do_plano` fora do Completo;
  - desativar membro com assinantes → 422 `assinaturas_ativas`, salvo com `cancelarAssinaturas: true`.
- **Validate**: `tests/routers/planos.test.ts` + matriz de papéis.

### PR 4: Vitrine pública (API)
- **Action**:
  - `GET /barbearias/:slug/planos`: planos ativos com vitrine ligada, recurso no plano e vendedor ativo que pode vender;
  - serviços incluídos com usos; o vendedor, com nome e foto.
- **Validate**: `tests/routers/planos-publicos.test.ts` (vitrine desligada = lista vazia, Grátis = vazia, vendedor sem permissão some).

### PR 5: Assinante no balcão (API)
- **Action**:
  - `POST /clientes/:id/assinaturas` (forma `no_balcao`, só planos que aceitam);
  - `GET /barbearias/me/assinantes?situacao=`;
  - `POST /assinaturas/:id/recebimentos` ("recebi", com a forma): grava o recebimento com a parte da casa congelada no próximo dia aberto e avança o ciclo;
  - `DELETE /assinaturas/:id` (cancelar);
  - tarefa diária na `fila` que passa para `em_atraso` o ciclo vencido sem "recebi".
- **Validate**: `tests/routers/assinantes.test.ts`.

### PR 6: "Pelo plano" e mensalidades no caixa (API)
- **Action**:
  - `PUT /agendamentos/:id/pagamento` aceita `assinaturaId` + os serviços cobertos (viram `uso_do_plano`), com `forma: "plano"` quando não há dinheiro, e as conferências da decisão 2. Erros: 422 `plano_de_outro_barbeiro`, `usos_esgotados`, `assinatura_inativa`;
  - `GET /barbearias/me/caixa` soma os recebimentos do dia ao acerto e à lista;
  - `GET /agendamentos/:id/pagamento` devolve as assinaturas usáveis do cliente;
  - quem lê a situação da assinatura chama antes o `marcarAtrasadas` (`lib/planos-do-cliente.ts`): o registro "pelo plano" e o `GET` do pagamento. Os usos do ciclo contam em `[ciclo_comeca_em, ciclo_termina_em)`.
- **Validate**: `tests/routers/pagamento.test.ts`, `caixa.test.ts` (os 3 cenários da GR com plano: barbeiro com 20%, plano da casa atendido pelo parceiro, assinante do Gustavo atendido pelo parceiro → avulso).

### PR 7: Telas do painel sem provedor (web)
- **Action**:
  - `/painel/planos`: lista com abas Planos e Assinantes; criar e editar plano; a vitrine liga e desliga ali;
  - "Pode vender planos" no detalhe do membro;
  - "Assinar plano" no detalhe do cliente, com "Recebi" por ciclo;
  - "Pelo plano" no registrar pagamento, com a frase do efeito;
  - recebimentos no Caixa;
  - item "Planos" no menu; convite fora do Completo.
- **Validate**: testes das telas + navegador em 375 e 1440.

**Parte B — online pelo Asaas**

### PR 8: Cifra e o conector do Asaas (API, sem rota)
- **Action**:
  - `lib/cifra.ts` e `CHAVE_DE_CIFRA` (`.env.example`; não sobe em produção sem ela);
  - `lib/provedores`: a interface `Provedor` (`conferirChave`, `registrarWebhook`, `criarCliente`, `criarAssinatura` → link da fatura, `lerAssinatura`, `lerCobranca`, `cancelarAssinatura`, `lerEvento`), mais a de memória e a do Asaas (`fetch`, base por modo);
  - `app.provedores(conexão)` na instância.
- **Conferir no sandbox do Asaas** (anotar no PR o que valeu):
  - (a) se o `cpfCnpj` é obrigatório para cobrar;
  - (b) se o cartão pago na fatura é cobrado sozinho nos ciclos seguintes;
  - (c) como a chave e a URL de sandbox e de produção se distinguem;
  - (d) os nomes exatos dos eventos (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`…) e o cabeçalho do token;
  - (e) como cancelar a assinatura.
- **Validate**: `tests/lib/cifra.test.ts` e `tests/lib/provedor-asaas.test.ts` com `fetch` falso, nas respostas gravadas do sandbox.

### PR 9: Conectar a conta (API)
- **Action**:
  - `GET/PUT/DELETE /barbearias/me/pagamentos-online` (a própria conta; `?daCasa=1` para o dono);
  - o PUT confere a chave e o modo, cifra, gera o `authToken` e registra o webhook;
  - o DELETE recusa com assinaturas vivas e apaga o webhook no Asaas.
- **Validate**: `tests/routers/pagamentos-online.test.ts` (a chave nunca volta na resposta, modo errado = 422, permissão).

### PR 10: Assinar online e o webhook (API)
- **Action**:
  - `POST /clientes/me/assinaturas`: logado; plano que aceita online e vendedor com conta conectada. Cria o cliente e a assinatura no Asaas e devolve o link da fatura; a assinatura nasce `pendente`;
  - `GET /clientes/me/assinaturas` e `DELETE /clientes/me/assinaturas/:id`;
  - `POST /webhooks/asaas/:conexaoId`: token conferido, estado relido no Asaas, evento deduplicado. O pagamento confirmado grava o recebimento e avança o ciclo;
  - notificação no sino de quem vende: "Nova assinatura", "Pagamento em atraso";
  - desativar membro com `cancelarAssinaturas: true` (PR 3 só marca `cancelada` no banco) passa a cancelar também no provedor as assinaturas online, e o `DELETE /assinaturas/:id` do painel (PR 5) também;
  - "minhas assinaturas" chama o `marcarAtrasadas` antes de ler;
  - sem tarefa agendada (PR 5), o "Pagamento em atraso" no sino só sai pras online, pelo webhook. Assinatura do balcão que atrasa aparece em atraso na lista, sem avisar ninguém;
  - o recebimento online entra no caixa (PR 6b) com `recebido_por_id` obrigatório. Ninguém segurou esse dinheiro: ele caiu na conta da casa ou na do vendedor. No acerto, `recebidoPor` tem de ser o dono da conta: `null` (a casa) no plano da casa, o vendedor no plano dele. Isso pede `recebido_por_id` anulável, numa migração.
- **Validate**: `tests/routers/assinar-online.test.ts`, `webhook-asaas.test.ts` (evento repetido vale uma vez, token errado = 401, conexão de outra barbearia, cobrança desconhecida → 200 + log).

### PR 11: Online nas telas (web)
- **Action**:
  - Configurações › **Pagamentos online**: colar a chave, ver a final, desconectar;
  - vitrine na página pública e `/[slug]/planos`: "Assinar" → entrar (se preciso) → CPF (se o PR 8 confirmar) → fatura do Asaas → volta para a Minha conta;
  - Minha conta: as assinaturas, os usos que sobram e cancelar.
- **Validate**: testes das telas + navegador em 375 e 1440; uma assinatura de verdade no sandbox.

### PR 12: Fechamento
- **Action**: novidade e perguntas na Central de ajuda; Privacidade e Termos; `screens.md`, roadmap e PRD (marco 3 `complete`).
- **Validate**: `pnpm type-check && pnpm lint`; leitura das páginas.

## Validation
```bash
cd barchop
pnpm --filter @barchop/formato test
pnpm --filter @barchop/api test -- <arquivos tocados>   # suíte inteira nos PRs 2, 6 e 10
pnpm --filter @barchop/web test -- <arquivos tocados>
pnpm type-check && pnpm lint
pnpm --filter @barchop/database exec prisma migrate deploy   # dev e test
```
- O webhook do Asaas precisa de URL pública, então o PC não recebe. O teste ponta a ponta dos PRs 10 e 11 roda na VM, com uma conta **sandbox** do Asaas e a API de produção em modo teste por um dia (como foi com a Stripe em 16/10). Se o dono preferir, um túnel (`cloudflared`) no PC.
- **Deploy da Parte B:** o dono gera e põe `CHAVE_DE_CIFRA` no `infra/api.env` da VM **antes** do deploy do PR 9 (`openssl rand -base64 32`). Perder essa chave obriga todo vendedor a conectar de novo.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| O Asaas não cobra o cartão sozinho nos ciclos seguintes pela fatura | Medium | Conferido no sandbox no PR 8, antes das rotas; a Parte A já entrega o marco "no balcão" |
| O Asaas exige CPF do cliente | High | Checkout pede o CPF e guarda no cadastro; Privacidade e Termos no PR 12 |
| Chave do vendedor vazada | Low | Cifrada com AES-GCM, nunca devolvida, `CHAVE_DE_CIFRA` só no ambiente; teste de que nenhuma resposta tem a chave |
| Webhook perdido (API fora do ar) deixa a assinatura desatualizada | Medium | O Asaas tenta de novo; o estado é relido a cada evento; "Atualizar" no detalhe do assinante relê no Asaas |
| Uso contado errado por registrar "pelo plano" no atendimento errado | Medium | Editar ou remover o pagamento com o dia aberto devolve o uso; a frase do efeito mostra "usa 1 de 4" antes de salvar |
| O acerto da GR com planos diverge da conta à mão | Medium | Os 3 cenários da GR como teste no PR 6 |
| Barbearia no Grátis com assinantes confunde o dono | Low | Decisão 6: as assinaturas seguem, a tela explica e convida ao Completo |
| O marco ficou grande (12 PRs) | High | A Parte A vai ao ar sozinha; a Parte B pode esperar sem quebrar nada |

## Acceptance
- [ ] A GR cria um plano da casa e um plano do Gustavo, um cliente assina cada um (um no balcão, um online no sandbox), e o acerto do dia bate com a conta à mão
- [ ] Os 12 PRs no ar, cada um em produção antes do próximo
- [ ] Nenhuma resposta da API contém a chave do vendedor
- [ ] Validação passa
- [ ] Padrões espelhados, não reinventados
