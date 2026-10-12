# Análise de Planos — Planos de assinatura do sistema BarbeiroApp

> Texto extraído do .docx original (12/10/2026), sem as figuras. Referência de concorrente para o PRD da Onda 2 (`.claude/prds/onda-2-dinheiro.prd.md`).

Grátis, Starter, Pro, WhatsApp e Enterprise: preços, recursos, regras de cobrança e formas de pagamento

Tela analisada: admin.barbeiro.app/subscription (Assinatura)

Conta de referência: BarbeariaTTT, hoje no plano Grátis, em período de teste

Data da análise: 12/10/2026

Elaborado por: Gustavo Falci (com apoio do Claude)

## 1. Visão geral

Esta é a tela em que o dono da barbearia assina o próprio BarbeiroApp (o SaaS). Ela é diferente do módulo "Planos de Assinatura", que serve para a barbearia vender planos aos clientes dela. A página funciona como um configurador de preço, com três controles no topo:

- Plano: Starter, Pro (marcado com ✦ como recomendado), WhatsApp e Enterprise.
- Profissionais: seletor −/+ que recalcula o preço conforme o tamanho da equipe.
- Ciclo de cobrança: Mensal ou Anual (selo de −20%). A tela informa que trocar de plano depois não tem taxa.

Abaixo dos controles ficam o cartão do plano escolhido (preço, composição, recursos, formas de pagamento e botão de assinar), o quadro "O que o seu teste mostrou", a tabela "Recurso por recurso" e as Perguntas frequentes.

### 1.1 Recomendação baseada no uso

O quadro "O que o seu teste mostrou" resume o período de teste (6 dias, de 05/10 a 19/10): 1 profissional, 0 agendamentos e 1 serviço cadastrado. Com esses dados o sistema recomenda um plano (hoje o Pro) e explica em "Por que o [plano] e não outro". Quando o usuário escolhe outro plano, uma faixa avisa "Você escolheu — o recomendado é o Pro". A frase "Nada aqui foi escolhido por nós — veja os números ao lado" reforça que a sugestão vem do uso real.

## 2. Resumo de preços

| Plano | Mensal (1 prof.) | Anual (por mês) | Profissional extra | Limite de profissionais | Promoção vista |
|---|---|---|---|---|---|
| Grátis | R$ 0 | — | — | 1 | — |
| Starter | R$ 29,90 | ≈ R$ 23,92* | R$ 10,00/mês | Até 3 | 3 primeiros meses a R$ 19,90 |
| Pro ✦ | R$ 39,90 | R$ 31,92 (R$ 383,04/ano) | R$ 20,00/mês | Ilimitado | 1º mês a R$ 9,90 (oferta do teste, acaba em 8 dias) |
| WhatsApp | R$ 99,90 | R$ 79,92 | R$ 20,00/mês | Ilimitado | — |
| Enterprise | R$ 119,90 | R$ 95,92 | R$ 20,00/mês | Ilimitado | — |

* O valor anual do Starter não foi aberto na tela; o número é estimado aplicando os 20% de desconto, como nos outros planos.

Fórmula de preço: base do plano (inclui 1 profissional) + N profissionais extras × valor unitário. No anual, o total do ano sai com 20% de desconto e é cobrado de uma vez. Exemplos conferidos na tela:

- Starter com 2 profissionais: R$ 29,90 + 1 × R$ 10,00 = R$ 39,90/mês.
- Starter com 3 profissionais: R$ 29,90 + 2 × R$ 10,00 = R$ 49,90/mês (limite do plano).
- Pro com 4 profissionais: R$ 39,90 + 3 × R$ 20,00 = R$ 99,90/mês (no anual, R$ 79,92/mês).
- WhatsApp com 3 profissionais: R$ 99,90 + 2 × R$ 20,00 = R$ 139,90/mês (no anual, R$ 111,92/mês).
- Enterprise com 3 profissionais: R$ 119,90 + 2 × R$ 20,00 = R$ 159,90/mês.

A cobrança é mensal no mesmo dia da assinatura ("Cobrado todo dia 12"), sem fidelidade.

## 3. Plano Grátis (atual)

É o plano em que a conta está hoje (selo "Grátis" ao lado do título). Ele não aparece como opção no seletor; só aparece como primeira coluna da tabela de recursos, para comparação.

| Item | Grátis |
|---|---|
| Profissionais | 1 |
| Agendamentos por mês | 100 |
| Serviços | 5 |
| Relatórios | Básicos |
| Notificações por e-mail | Sim |
| Conta do profissional | Sim |
| Demais recursos | Não incluídos |

Para quem: barbeiro autônomo começando, com pouco volume (até cerca de 3 a 4 atendimentos por dia útil).

## 4. Plano Starter

Plano de entrada pago. Tira os limites de agendamentos e serviços e acrescenta bloqueio de horários.

| Item | Detalhe |
|---|---|
| Preço | R$ 29,90/mês com 1 profissional incluso |
| Profissional extra | R$ 10,00/mês cada |
| Limite | Até 3 profissionais ("Para uma equipe maior, escolha o Pro") |
| Promoção | Os 3 primeiros meses saem por R$ 19,90/mês; depois, R$ 29,90/mês |
| Formas de pagamento | Cartão ou boleto (via Stripe) |
| Recursos | Agendamentos e serviços ilimitados, bloqueio de horários, relatórios básicos, notificações por e-mail, conta do profissional |

Para quem: barbearias pequenas (1 a 3 cadeiras) que só precisam de agenda online e controle básico.

## 5. Plano Pro ✦ (recomendado)

É o plano que o sistema destaca e recomenda. Libera profissionais ilimitados e quase todos os recursos de gestão e relacionamento com o cliente.

| Item | Detalhe |
|---|---|
| Preço | R$ 39,90/mês com 1 profissional incluso |
| Anual | R$ 31,92/mês (R$ 383,04 cobrados uma vez por ano, economia de R$ 95,76) |
| Profissional extra | R$ 20,00/mês cada, sem limite |
| Promoção | Oferta do teste: 1º mês por R$ 9,90 (acaba em 8 dias). A partir de 12/11, R$ 39,90/mês; o teste termina no pagamento |
| Formas de pagamento | Cartão, Pix (autorização recorrente no app do banco) ou boleto |

Recursos além do Starter:

- Relatórios avançados
- Penalidade por falta ou cancelamento em cima da hora
- Marca personalizada
- Programa de fidelidade
- Catálogo de produtos e estoque
- Solicitação de avaliações
- Login por WhatsApp no agendamento
- Agendamentos recorrentes
- Lembretes automáticos
- Comissão sobre produtos
- Lembrete de reposição de produtos
- Notificações WhatsApp
- Acréscimo ou desconto por forma de pagamento
- Integração com Google Calendar

Para quem: barbearias em crescimento que querem reduzir faltas, fidelizar clientes e vender produtos.

## 6. Plano WhatsApp

Plano voltado à operação pelo WhatsApp oficial do negócio. Tem os mesmos recursos do Enterprise, mas exige o WhatsApp do negócio conectado: em vez do botão de assinar, aparece "Conectar meu WhatsApp".

| Item | Detalhe |
|---|---|
| Preço | R$ 99,90/mês com 1 profissional incluso |
| Anual | R$ 79,92/mês (economia de R$ 239,76 por ano) |
| Profissional extra | R$ 20,00/mês cada |
| Custo de mensagens | Cobrado pela Meta direto no cartão do negócio, ao preço dela, sem acréscimo do BarbeiroApp |
| Pré-requisito | WhatsApp do negócio conectado antes da assinatura |

Recursos além do Pro:

- Emissão de NFS-e
- Assistente de IA
- Domínio personalizado
- Entrar na conta com WhatsApp
- Suporte prioritário
- Loja online de produtos
- Campanhas de marketing
- WhatsApp com número próprio
- Atendimento por WhatsApp
- Gestão de desempenho
- Venda de produtos no agendamento

Para quem: barbearias que fazem o atendimento e o agendamento principalmente pelo WhatsApp e querem automatizar isso com número próprio.

## 7. Plano Enterprise

Plano mais completo e mais caro. Na tabela de recursos, a lista é idêntica à do plano WhatsApp. A diferença visível é que o Enterprise não exige WhatsApp conectado para assinar e mostra o checkout normal (cartão, Pix ou boleto).

| Item | Detalhe |
|---|---|
| Preço | R$ 119,90/mês com 1 profissional incluso |
| Anual | R$ 95,92/mês (economia de R$ 287,76 por ano) |
| Profissional extra | R$ 20,00/mês cada |
| Formas de pagamento | Cartão, Pix (recorrente) ou boleto |
| Recursos | Todos os do plano WhatsApp: NFS-e, assistente de IA, domínio personalizado, loja online, campanhas de marketing, suporte prioritário, gestão de desempenho etc. |

Para quem: redes ou barbearias maiores que querem todos os recursos sem depender da integração com o WhatsApp oficial.

## 8. Comparativo completo de recursos

A tabela "Recurso por recurso" da tela mostra três colunas: Grátis, o plano selecionado e o plano anterior. A tabela abaixo junta tudo numa só visão (✓ = incluído).

| Recurso | Grátis | Starter | Pro | WhatsApp | Enterprise |
|---|---|---|---|---|---|
| Profissionais | 1 | 3 | Ilimitado | Ilimitado | Ilimitado |
| Agendamentos/mês | 100 | Ilimitado | Ilimitado | Ilimitado | Ilimitado |
| Serviços | 5 | Ilimitado | Ilimitado | Ilimitado | Ilimitado |
| Relatórios | Básicos | Básicos | Avançados | Avançados | Avançados |
| Notificações por e-mail | ✓ | ✓ | ✓ | ✓ | ✓ |
| Conta do profissional | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bloqueio de horários | — | ✓ | ✓ | ✓ | ✓ |
| Penalidade por falta/cancelamento | — | — | ✓ | ✓ | ✓ |
| Marca personalizada | — | — | ✓ | ✓ | ✓ |
| Programa de fidelidade | — | — | ✓ | ✓ | ✓ |
| Catálogo de produtos e estoque | — | — | ✓ | ✓ | ✓ |
| Solicitação de avaliações | — | — | ✓ | ✓ | ✓ |
| Login por WhatsApp no agendamento | — | — | ✓ | ✓ | ✓ |
| Agendamentos recorrentes | — | — | ✓ | ✓ | ✓ |
| Lembretes automáticos | — | — | ✓ | ✓ | ✓ |
| Comissão sobre produtos | — | — | ✓ | ✓ | ✓ |
| Lembrete de reposição de produtos | — | — | ✓ | ✓ | ✓ |
| Notificações WhatsApp | — | — | ✓ | ✓ | ✓ |
| Acréscimo/desconto por forma de pagamento | — | — | ✓ | ✓ | ✓ |
| Integração com Google Calendar | — | — | ✓ | ✓ | ✓ |
| Emissão de NFS-e | — | — | — | ✓ | ✓ |
| Assistente de IA | — | — | — | ✓ | ✓ |
| Domínio personalizado | — | — | — | ✓ | ✓ |
| Entrar na conta com WhatsApp | — | — | — | ✓ | ✓ |
| Suporte prioritário | — | — | — | ✓ | ✓ |
| Loja online de produtos | — | — | — | ✓ | ✓ |
| Campanhas de marketing | — | — | — | ✓ | ✓ |
| WhatsApp com número próprio | — | — | — | ✓ | ✓ |
| Atendimento por WhatsApp | — | — | — | ✓ | ✓ |
| Gestão de desempenho | — | — | — | ✓ | ✓ |
| Venda de produtos no agendamento | — | — | — | ✓ | ✓ |

## 9. Cobrança e formas de pagamento

A assinatura do BarbeiroApp é processada pelo Stripe. As opções que aparecem dependem do plano:

| Forma | Como funciona (texto da tela) | Starter | Pro / Enterprise | WhatsApp |
|---|---|---|---|---|
| Cartão | Termina na página segura do Stripe; o acesso vem na hora | ✓ | ✓ | Após conectar o WhatsApp |
| Pix | Autoriza uma vez no app do banco; todo mês a fatura sai sozinha | — | ✓ | Após conectar o WhatsApp |
| Boleto | Página do Stripe, vence em 3 dias; libera quando o banco confirma | ✓ | ✓ | Após conectar o WhatsApp |

Garantias exibidas no rodapé: sem fidelidade (cancela quando quiser), pagamento no cartão ou boleto via Stripe, nota fiscal e recibo em cada fatura, e exportação dos dados a qualquer hora.

Inconsistência observada: o FAQ diz "Aceitamos cartão de crédito", mas a tela oferece também boleto e, em alguns planos, Pix. As formas de pagamento do plano WhatsApp não puderam ser vistas, porque o checkout só aparece depois de conectar o WhatsApp.

## 10. Perguntas frequentes (conforme a tela)

| Pergunta | Resposta |
|---|---|
| Quando a assinatura começa a cobrar? | Assim que a assinatura é confirmada no checkout. O acesso que você já tem continua normalmente. |
| Posso cancelar a qualquer momento? | Sim, sem multa ou taxa. O acesso continua até o fim do período já pago. |
| Qual a diferença entre mensal e anual? | No anual você paga um valor único por ano com desconto. Planos sem preço anual configurado ficam só no mensal. |
| O que acontece se o pagamento falhar? | Você recebe uma notificação e tem alguns dias para regularizar; o acesso continua nesse período. |
| Quais formas de pagamento são aceitas? | Cartão de crédito, processado pelo Stripe. |
| Como funciona o suporte prioritário? | Atendimento acelerado nos canais de suporte, com menor tempo de resposta. |

## 11. Observações

### 11.1 Estratégia de preços percebida

- Ancoragem no Pro: é o único plano com o ícone ✦, a recomendação automática e a oferta mais agressiva (1º mês a R$ 9,90), além de custar só R$ 10 a mais que o Starter.
- Cobrança por profissional: a base inclui 1 profissional; os extras custam R$ 10 no Starter e R$ 20 nos demais. O Starter limita a equipe a 3, o que leva equipes maiores para o Pro.
- Desconto anual uniforme de 20% em todos os planos pagos.
- WhatsApp × Enterprise: têm os mesmos recursos. O WhatsApp é R$ 20 mais barato, mas exige o WhatsApp oficial conectado e o negócio paga as mensagens à Meta.

### 11.2 Pontos de atenção na interface

- Erro de concordância: "Para 1 profissionais" e "Sua equipe tem 1 profissionais".
- O texto "Por que o Pro e não outro" diz que o Starter acrescenta campanhas de marketing e domínio próprio, mas na tabela esses recursos só existem nos planos WhatsApp/Enterprise. O texto parece genérico.
- O cartão do Starter diz "Para 1 profissionais" enquanto a tabela informa limite de 3; os dois estão certos (1 incluso, até 3 no total), mas podem confundir.
- O FAQ está sem acentuação ("comeca", "diferenca", "cartao").

### 11.3 Limitações desta análise

- Nenhum botão de assinatura, "Conectar meu WhatsApp" ou "Falar com a gente" foi acionado, para não iniciar cobrança nem integração.
- O preço anual do Starter e o checkout do Stripe não foram vistos.
- Os seletores de plano, profissionais e ciclo só simulam valores na tela; nada foi salvo na conta.
