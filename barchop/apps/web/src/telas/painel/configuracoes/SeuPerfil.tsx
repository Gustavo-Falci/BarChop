"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { TelefoneInvalido } from "@barchop/formato";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { Campo } from "../../../componentes/Campo";
import { Secao } from "../../../componentes/Secao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MENSAGEM_DO_TELEFONE, telefoneOuNulo } from "./telefone";
import estilos from "./Configuracoes.module.css";

// O perfil de quem está logado — de cada pessoa da equipe, não da
// barbearia. Por isso não tem selo nem conta no "X de N decididas".
// Pra recepção e profissional, é a tela inteira das Configurações
// (`comVoltar={false}`: o índice é ela mesma).
export function SeuPerfil({ comVoltar = true }: { comVoltar?: boolean }) {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const [nome, setNome] = useState(perfil.nome);
  const [telefone, setTelefone] = useState(perfil.telefone ?? "");
  const [erro, setErro] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setAviso(undefined);
    setErro(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMeuPerfil({ nome: nome.trim(), telefone: telefoneOuNulo(telefone) });
    } catch (causa) {
      if (causa instanceof TelefoneInvalido) {
        setErro(MENSAGEM_DO_TELEFONE);
        return;
      }
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      // `finally`: o `return` do telefone inválido pularia uma linha
      // solta e deixaria o botão travado.
      setSalvando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Seu perfil"
        apoio="Seus dados na equipe, separados dos dados da barbearia."
        voltar={comVoltar ? { href: "/painel/configuracoes", rotulo: "Configurações" } : undefined}
      />
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      <div className={estilos.ladoALado}>
        <Secao
          titulo="Seus dados"
          acao={
            <Botao onClick={salvar} carregando={salvando}>
              Salvar perfil
            </Botao>
          }
        >
          <div className={estilos.camposLadoALado}>
            <Campo rotulo="Seu nome" valor={nome} onChange={setNome} />
            <Campo rotulo="Seu telefone" formato="telefone" valor={telefone} onChange={setTelefone} erro={erro} />
          </div>
        </Secao>
      </div>
    </div>
  );
}
