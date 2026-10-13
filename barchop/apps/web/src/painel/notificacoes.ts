// Quanto tempo faz, do jeito que cabe na linha do sino: "agora",
// "há 5 min", "há 3 h" no mesmo dia, "ontem", e a data (02/10) depois
// disso. No fuso do aparelho, que é o do barbeiro olhando o painel.
export function tempoDesde(iso: string, agora: Date = new Date()): string {
  const quando = new Date(iso);
  const minutos = Math.floor((agora.getTime() - quando.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const mesmoDia = quando.toDateString() === agora.toDateString();
  if (mesmoDia) return `há ${Math.floor(minutos / 60)} h`;

  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (quando.toDateString() === ontem.toDateString()) return "ontem";

  const dia = String(quando.getDate()).padStart(2, "0");
  const mes = String(quando.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

// O nome do botão do sino, que é o que o leitor de tela anuncia: o
// número sozinho no canto não diz do que é.
export function rotuloDoSino(naoLidas: number): string {
  if (naoLidas === 0) return "Notificações";
  return `Notificações, ${naoLidas} ${naoLidas === 1 ? "não lida" : "não lidas"}`;
}
