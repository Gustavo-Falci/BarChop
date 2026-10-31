# Respostas da InfinitePay

**Não gravadas.** Montadas a partir dos exemplos da documentação oficial
(https://www.infinitepay.io/checkout-documentacao, conferida em 31/10/2026),
porque a InfinitePay não tem sandbox e o dono decidiu não testar com dinheiro
de verdade (plano `pagamentos-online-infinitepay`, decisão 16).

- `pagamento-conferido.json`: o exemplo do `payment_check` da documentação.
- `pagamento-nao-confere.json`: "quando algo não bate, a API responde 200 com
  `success: false` ou `paid: false`".
- `aviso-de-pagamento.json`: o exemplo do corpo do webhook.
- `link-criado.json`: **a documentação não mostra a resposta** do criar link,
  só diz que a URL vem nela. O nome do campo é um palpite (`url`); o conector
  também aceita `link` e `checkout_url`.

Todos os valores são de exemplo. Quando a primeira conta real mostrar a forma
de verdade, trocar estes arquivos e anotar nas "Diferenças" do plano.
