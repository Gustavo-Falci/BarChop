import estilos from "./MiniaturaDoServico.module.css";

// A foto do serviço, ou a inicial do nome quando o dono ainda não pôs
// uma. Decorativa nos dois casos: quem usa a miniatura põe o nome ao
// lado, e um alt repetindo o nome faria o leitor de tela ler duas vezes.
export function MiniaturaDoServico({
  nome,
  fotoUrl,
  tamanho = "pequena",
}: {
  nome: string;
  fotoUrl: string | null;
  tamanho?: "pequena" | "grande";
}) {
  const classe = `${estilos.miniatura} ${estilos[tamanho]}`;
  if (fotoUrl) {
    // <img> simples, como no CampoDeImagem: a imagem vem do bucket (ou
    // da API em desenvolvimento), e o otimizador do Next exigiria
    // liberar os dois domínios.
    return <img className={classe} src={fotoUrl} alt="" loading="lazy" />;
  }
  return (
    <span className={`${classe} ${estilos.inicial}`} aria-hidden="true">
      {nome.trim().charAt(0).toLocaleUpperCase("pt-BR")}
    </span>
  );
}
