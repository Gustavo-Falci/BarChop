// O CPF do assinante online (Onda 2, marco 3, PR 10c do plano
// planos-de-assinatura): o Asaas não cobra a assinatura sem ele. Entra
// com ou sem máscara e é guardado só com os 11 dígitos
// (`cliente.cpf`, CHECK na migration 20261028120000_mensalidade_online).

function digitoVerificador(digitos: string): number {
  const peso = digitos.length + 1;
  const soma = [...digitos].reduce((total, digito, i) => total + Number(digito) * (peso - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

// Os 11 dígitos, ou null se não é um CPF: tamanho errado, todos iguais
// (passam na conta, mas não existem) ou dígito verificador que não confere.
export function normalizarCpf(texto: string): string | null {
  const digitos = texto.replace(/[\s.-]/g, "");
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return null;
  const primeiro = digitoVerificador(digitos.slice(0, 9));
  const segundo = digitoVerificador(digitos.slice(0, 10));
  return primeiro === Number(digitos[9]) && segundo === Number(digitos[10]) ? digitos : null;
}
