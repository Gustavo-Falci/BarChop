# Análise Funcional — Módulo de Planos de Assinatura — BarbeiroApp

> Texto extraído do .docx original (12/10/2026), sem as figuras. Referência de concorrente para o PRD da Onda 2 (`.claude/prds/onda-2-dinheiro.prd.md`).

Telas, funcionalidades, regras de negócio e integrações com meios de pagamento

Ambiente analisado: admin.barbeiro.app (painel administrativo)

Conta de referência: BarbeariaTTT (estabelecimento sem planos e sem gateway conectado)

Data da análise: 12/10/2026

Elaborado por: Gustavo Falci (com apoio do Claude)

## 1. Resumo executivo

O módulo de Planos de Assinatura do BarbeiroApp permite à barbearia vender serviços de forma recorrente ou antecipada, com três modelos de produto: Assinatura (recorrente), Pacote pré-pago e Convênio. O módulo é dividido em três áreas principais:

- Planos de Assinatura (/membership-plans) — cadastro e configuração dos planos, mais os "Ajustes da vitrine" (o que aparece no site e como o cliente pode pagar).
- Assinaturas (/membership) — gestão dos clientes assinantes (status, filtros, colunas) e painel de Receita recorrente.
- Configurações › Pagamentos (/settings/payments) — conexão com os provedores de pagamento MercadoPago, Asaas e Stripe.

Destaques observados:

- Sugestão de preço inteligente que calcula piso, teto e margem com base no consumo de clientes recorrentes (ou na média da plataforma, quando a loja tem pouco histórico).
- Controle fino de uso: limite por serviço por ciclo, intervalo mínimo entre usos, dias da semana permitidos (yield management) e limite de agendamentos futuros simultâneos.
- Pagamento online via PIX, Pix Automático e cartão de crédito recorrente, além de pagamento no local; os métodos online dependem de um provedor conectado.
- Modelo "conta própria": o dinheiro cai direto na conta do estabelecimento no provedor, e a taxa da plataforma é descontada pelo próprio provedor.

## 2. Mapa de telas e navegação

| Tela / subtela | Caminho | Função |
|---|---|---|
| Planos de Assinatura (lista) | /membership-plans | Lista de planos, status da vitrine, botão Novo Plano |
| Menu "Novo Plano" | dropdown | Escolha: Nova assinatura, Novo pacote, Novo convênio |
| Novo plano — Assinatura | /membership-plans/new?kind=SUBSCRIPTION | Formulário de plano recorrente |
| Novo plano — Pacote | mesmo formulário, tipo "Pacote pré-pago" | Formulário de pacote de pagamento único |
| Novo convênio | mesmo formulário, "Trocar" › Convênio | Desconto para clientes de empresa parceira |
| Modal "Como calculamos a sugestão" | botão no formulário | Explica a fórmula de preço sugerido e glossário |
| Painel "Vitrine da assinatura" | botão Ajustes da vitrine | Chave mestra e formas de pagamento aceitas |
| Assinaturas (assinantes) | /membership | Gestão de assinantes, filtros por status |
| Receita | /membership/revenue | Indicadores de receita recorrente |
| Configurações › Pagamentos | /settings/payments | Conectar MercadoPago, Asaas ou Stripe |
| Configurações › Regras de agendamento | /settings/booking | Comissão padrão de atendimento de assinatura |

## 3. Tela principal — Planos de Assinatura

A tela inicial lista os planos cadastrados. Sem planos, mostra um estado vazio com o botão "Criar primeiro plano". No topo há uma barra de status da vitrine com quatro informações:

- Assinatura no site: ligada/desligada — reflete a chave mestra da vitrine.
- X de Y planos na vitrine — quantos planos estão visíveis ao público.
- Cliente paga com… — hoje "na loja", porque não há provedor conectado.
- Selo "sem gateway conectado" — alerta de que pagamentos online estão indisponíveis.

O botão Novo Plano abre um menu com os três tipos de produto:

### 3.1 Comparativo dos três tipos de plano

| Característica | Assinatura | Pacote pré-pago | Convênio |
|---|---|---|---|
| Cobrança | Recorrente (renova sozinha) | Pagamento único | Nenhuma — cliente paga cada serviço com desconto |
| Ciclo | Semanal, Mensal ou Anual | Validade em dias (opcional) | Sem prazo nem renovação |
| Limites de uso | Por serviço, por ciclo (renovam) | Total do pacote (não renovam) | Não se aplica |
| Período de teste | Sim (Dias de teste) | Não | Não |
| Sugestão de preço | Sim | Não observada | Não |
| Aparece na vitrine | Sim (pode ser destaque) | Sim | Nunca — só equipe vê |
| Entra na Receita Recorrente | Sim | Não | Não |

## 4. Formulário — Nova assinatura (recorrente)

O formulário é dividido em duas colunas: à esquerda o tipo (Plano/Convênio) e a identificação; à direita cobrança, serviços e ajustes avançados.

### 4.1 Identificação

- Nome do plano (ex.: "Plano Premium").
- Descrição — benefícios exibidos ao cliente.
- Imagem de capa — PNG, JPG ou WebP, até 5 MB, recomendado 1200×630 px.

### 4.2 Cobrança e preço

- Tipo de plano: Assinatura (recorrente) ou Pacote pré-pago (paga uma vez).
- Ciclo de cobrança: Semanal, Mensal ou Anual.
- Dias de teste: período gratuito antes da primeira cobrança.
- Preço: valor cobrado por ciclo.

### 4.3 Sugestão de preço inteligente

Ao selecionar ao menos um serviço, surge um quadro que sugere o preço do plano. Ele mostra preço sugerido, economia do cliente assíduo, piso, teto, margem e um controle deslizante de desconto (padrão 6%). O botão "Usar este preço" preenche o campo Preço.

O link "Como é calculado?" abre um modal que detalha a fórmula:

| Conceito | Definição exibida no sistema |
|---|---|
| Cliente típico | Mediana dos clientes recorrentes; define o custo (piso). |
| Cliente assíduo | Entre os 10% que mais consomem; define o teto. |
| Teto | Quanto o cliente assíduo gastaria pagando avulso por ciclo. |
| Piso (break-even) | Comissão paga pelo cliente típico por ciclo; mínimo que a mensalidade precisa cobrir. |
| Preço sugerido | (100% − desconto) × teto, nunca abaixo do piso. |
| Sua margem | Preço sugerido − piso. |
| Pior caso | Margem se o assinante usar todos os limites no serviço de maior comissão. |
| Modelo por fichas | Comissão como fração fixa da receita (repasse a um "pote"), independente do uso. |

Observação: a loja analisada tem 0 clientes recorrentes, então a sugestão usa a média da plataforma (2 usos por ciclo para o cliente típico e 4 para o assíduo). A comissão de membro está em R$ 0, por isso o piso aparece como R$ 0,00 — o próprio sistema avisa que, assim, os profissionais não ganham nada nas visitas cobertas.

Quando o serviço passa a ter limite, a sugestão é recalculada e passa a exibir também a margem no pior caso:

### 4.4 Serviços e limites

Lista os serviços cadastrados na barbearia (no ambiente, apenas "Corte Masculino"). Para cada serviço marcado:

- Ilimitado ou Com limite (quantidade de usos por ciclo, com botões −/+).
- Intervalo mínimo entre usos (opcional) — dias de espera entre agendamentos do mesmo serviço, com atalhos "Toda semana", "A cada 15 dias" e "1× por mês".
- Como aparece — prévia do texto exibido ao cliente (ex.: "até 1× por mês · 15 dias entre usos").
- Remover do plano.

### 4.5 Ajustes avançados

#### Dias permitidos

Restringe os dias da semana em que o plano pode ser usado (o sistema chama de "yield management" — direcionar assinantes para dias de menor movimento). Atalhos: Qualquer dia, Ter–Qua, Seg–Qui, Seg–Sex, ou seleção individual de Seg a Dom.

#### Uso e regras

Limite de agendamentos futuros simultâneos: quantos horários futuros o assinante pode ter reservados ao mesmo tempo. Vazio = ilimitado.

#### Publicação

- Ativo — permite novas assinaturas.
- Destacar como mais popular — exibe selo na vitrine pública; só um plano pode ter o selo (o anterior é desmarcado automaticamente).

## 5. Formulário — Pacote pré-pago

Usa o mesmo formulário, com Tipo de plano = "Pacote pré-pago (paga uma vez)". O cliente paga uma vez e vai consumindo. Os limites por serviço passam a valer para o total do pacote (ex.: 4 cortes = 4 cortes no total), sem cobrança recorrente. Campos específicos:

- Validade (dias) — em branco = nunca expira (recomendado). Com prazo, o saldo não usado é perdido e não há devolução automática.
- Quantos serviços no total? — para pacotes "N à escolha" (ex.: 5 serviços quaisquer). Se cada serviço já tem sua quantidade, deixar em branco.
- Preço — valor único.

Existe também, no menu Vendas, um item "Pacotes" (/service-bundles), que parece ser um cadastro separado de combos de serviços. Ele não foi analisado aqui por estar fora do módulo de assinaturas.

## 6. Formulário — Convênio

Acessado por "Novo convênio" ou pelo botão "Trocar" no formulário, que pergunta: "Você vende isso para o cliente, ou ele já tem por pertencer a um grupo de fora?".

O convênio é um desconto percentual em serviços para clientes de uma empresa, academia ou instituição parceira. O cliente continua pagando cada serviço, com o desconto, enquanto o convênio estiver ativo. O nome do convênio é interno: ele nunca aparece na vitrine. Ajustes disponíveis: Dias permitidos e Publicação (Ativo).

## 7. Ajustes da vitrine (venda online)

Painel lateral que define o que o cliente vê no site e como pode pagar. A venda no balcão não depende destes ajustes. Cada chave salva na hora.

| Chave | Efeito | Situação na conta |
|---|---|---|
| Mostrar seção de assinaturas (chave mestra) | Desligada, remove a página de assinaturas, a seção no agendamento, a API pública de planos e o sitemap. | Ligada |
| Permitir PIX | Assinatura paga com PIX (QR Code) a cada ciclo. | Ligada, mas indisponível: o provedor atual não oferece |
| Permitir Pix Automático | Cliente autoriza uma vez no banco e as cobranças seguintes são debitadas sem QR Code. | Ligada, mas indisponível |
| Permitir cartão de crédito | Cobrança recorrente automática no cartão a cada ciclo. | Ligada, mas indisponível |
| Permitir pagamento no local | Ligada: o cliente escolhe pagar no local e o plano fica ativo antes do pagamento. Desligada: paga online na hora da assinatura. | Ligada |

A API pública de planos e o sitemap citados na chave mestra indicam que os planos são expostos para integração com o site e para SEO.

## 8. Gestão de assinantes (Assinaturas)

A tela Assinaturas é o painel operacional dos clientes assinantes. Tem atalhos para "Gerenciar planos" e "Criar primeiro plano", busca por nome ou e-mail e filtros de status com contadores:

| Status | Significado provável |
|---|---|
| Ativas | Assinaturas em dia |
| Em atraso | Cobrança vencida e não paga |
| Pendentes | Aguardando primeiro pagamento (ex.: pagamento no local) |
| Agendadas | Com início futuro |
| Pausadas | Suspensas temporariamente |
| Vencidas | Prazo/validade expirado (ex.: pacotes) |
| Canceladas | Encerradas |
| Total | Todas |

* Os significados são inferidos pelo nome, porque não havia assinantes para observar.

Filtros adicionais: Modo de cobrança (Online / Presencial) e Preço. O seletor Colunas exibe Cliente, Plano, Paga, Próxima (fixas), Como e Últimos ciclos.

### 8.1 Aba Receita

Painel semanal de saúde financeira das assinaturas:

- Status do dia ("Tudo em dia") e meta de receita mensal configurável.
- Receita prevista (próximos 30 dias), separando "Entra sozinho" (cobrança automática) de "Você precisa cobrar" (manual/presencial).
- Receita em risco — cobranças com problema.
- Receita recorrente — só assinaturas; pacotes e convênios não entram.
- Crescimento — novas, upgrades, downgrades e cancelamentos, com receita líquida.
- Mix da receita por plano e O que aconteceu (últimos 14 dias).

## 9. Integrações com sistemas de pagamento

As integrações ficam em Configurações › Pagamentos, marcada como "Pendente" na visão geral. O texto da tela resume a proposta: sem conta conectada, o cliente só paga no balcão; conectando, a barbearia recebe antes e segura o horário só para quem pagou.

### 9.1 Provedores disponíveis

| Provedor | Métodos (conforme a tela) | Forma de conexão |
|---|---|---|
| MercadoPago | Pix e cartão | Login com a conta existente (OAuth) |
| Asaas | Pix e cartão | Colar a chave de API no próprio painel |
| Stripe | Somente cartão | Login com a conta existente (OAuth) |

Modelo financeiro: a conta é do estabelecimento e o dinheiro cai direto nela. A taxa da plataforma BarbeiroApp sobre cada pagamento online é descontada pelo próprio provedor, junto com a taxa dele (modelo de split/marketplace).

### 9.2 Etapas liberadas depois de conectar

- Em que formas o cliente pode pagar online.
- Quanto tempo o horário fica preso esperando o pagamento.
- Pagamento na reserva.

### 9.3 Preço por forma de pagamento

Permite desconto ou acréscimo por forma de pagamento (ex.: Pix −5%, vale +10%). Vale no balcão e na reserva, só sobre o atendimento/venda (nunca sobre gorjeta), e não altera comissões nem cobranças já feitas. O desconto Pix da loja online é uma regra separada, em Regras de agendamento. Há também um atalho para "Adquirentes e taxas" (maquininhas, taxas e prazo de recebimento).

### 9.4 Matriz: método de pagamento × provedor

| Método na vitrine | MercadoPago | Asaas | Stripe | Sem provedor |
|---|---|---|---|---|
| PIX (QR Code por ciclo) | Sim | Sim | Não | Não |
| Pix Automático | Não confirmado | Não confirmado | Não | Não |
| Cartão recorrente | Sim | Sim | Sim | Não |
| Pagamento no local | Sim | Sim | Sim | Sim |

A tela de Pagamentos lista só "Pix e cartão" ou "Cartão" por provedor. Para saber quais provedores suportam Pix Automático, é preciso conectar um provedor de teste.

### 9.5 Configurações relacionadas

- Regras de agendamento › Comissão padrão — Atendimento de assinatura: "Não definida". É isso que zera o piso na sugestão de preço. Recomenda-se definir antes de precificar os planos.
- Agendamentos recorrentes: o sistema informa que o recurso fica disponível só em planos que incluem agendamentos recorrentes.
- Método de pagamento padrão ao concluir atendimento: "Nenhum" (pergunta a forma de pagamento).

## 10. Fluxo ponta a ponta (visão consolidada)

- Configurar a comissão de atendimento de assinatura (Regras de agendamento).
- Conectar um provedor (MercadoPago, Asaas ou Stripe) em Configurações › Pagamentos.
- Criar o plano: tipo, ciclo, serviços/limites, preço (opcionalmente via sugestão) e ajustes avançados.
- Publicar: plano Ativo e, se quiser, "Mais popular"; chave mestra da vitrine ligada.
- Definir na vitrine as formas aceitas (PIX, Pix Automático, cartão, no local).
- O cliente assina pelo site/agendamento ou é inscrito pelo painel (balcão).
- Acompanhar em Assinaturas (status e cobrança) e na aba Receita (previsão, risco, crescimento).

## 11. Observações, pontos de atenção e oportunidades

### 11.1 Pontos fortes

- Precificação assistida com explicação transparente da fórmula e glossário.
- Regras de uso granulares (limite, intervalo, dias, reservas simultâneas) para proteger a agenda.
- Três modelos de produto num só cadastro, com textos que explicam a diferença ao lojista.
- Suporte a Pix Automático, recurso recente do ecossistema PIX, para recorrência sem atrito.
- Painel de receita com foco em ação ("você precisa cobrar", "receita em risco").

### 11.2 Pontos de atenção

- O rótulo "Imagem de capa" aparece duplicado no formulário (detalhe de interface).
- As chaves de PIX, Pix Automático e cartão aparecem ligadas mesmo sem provedor, só com um aviso; isso pode confundir o lojista.
- Sem comissão de assinatura configurada, a sugestão de preço ignora o custo com profissionais.
- Pacote com validade perde o saldo sem devolução automática; vale comunicar isso bem ao cliente.

### 11.3 Limitações desta análise

- Nenhum plano foi salvo e nenhum provedor foi conectado, para não alterar o ambiente. As telas de edição de plano, detalhe do assinante e checkout público não foram vistas.
- As chaves da vitrine não foram alteradas (salvam na hora).
- Significados de status e suporte a Pix Automático por provedor ficaram como inferência, sem confirmação.
