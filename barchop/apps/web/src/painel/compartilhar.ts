import { enderecoDaBarbearia } from "../tenant/endereco";

// O que a janela de compartilhar do Hoje (painel v2, marco 4) manda.
// Puro: quem lê a config do site e o host atual é quem chama.

// O endereço inteiro: vai pro WhatsApp e pro QR, então precisa abrir
// fora do painel. Sem o site configurado (desenvolvimento), o caminho
// /<slug> no host atual.
export function linkDaBarbearia(slug: string, urlDoSite: string | undefined, origem: string): string {
  const endereco = enderecoDaBarbearia(slug, urlDoSite);
  return endereco.startsWith("/") ? `${origem}${endereco}` : endereco;
}

export function mensagemDoLink(nomeDaBarbearia: string, link: string): string {
  return `Agende seu horário na ${nomeDaBarbearia} pelo link: ${link}`;
}

// Sem número: quem compartilha escolhe o contato ou o grupo.
export function urlDoWhatsApp(nomeDaBarbearia: string, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagemDoLink(nomeDaBarbearia, link))}`;
}
