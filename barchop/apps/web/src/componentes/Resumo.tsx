import estilos from "./Resumo.module.css";

// A barra "2 serviços · 50 min" que aparece em três passos.
export function Resumo({ itens }: { itens: string[] }) {
  return (
    <div className={estilos.resumo}>
      {itens.map((item, indice) => (
        <span key={item} className={indice > 0 ? estilos.valor : undefined}>
          {item}
        </span>
      ))}
    </div>
  );
}
