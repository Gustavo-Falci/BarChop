"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { PADRAO_INSTAGRAM, TelefoneInvalido } from "@barchop/formato";
import { Aviso } from "../../../componentes/Aviso";
import { BarraDeMudancas } from "../../../componentes/BarraDeMudancas";
import { Campo } from "../../../componentes/Campo";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { MolduraDaArea, SoODono, useAreasDecididas } from "./MolduraDaArea";
import { MENSAGEM_DO_TELEFONE, telefoneOuNulo } from "./telefone";
import estilos from "./Configuracoes.module.css";
import { Carregando } from "../../../componentes/Carregando";

// Comunicação: como o cliente fala com a barbearia fora do app — o
// telefone, o botão de WhatsApp e o Instagram da página pública.
export function ComunicacaoDaBarbearia() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") return <SoODono area="comunicacao" />;
  return <Comunicacao />;
}

type Contatos = { telefone: string; whatsapp: string; instagram: string };

// O nome de cada campo no "o que mudou" da barra.
const ROTULO: Record<keyof Contatos, string> = {
  whatsapp: "WhatsApp",
  telefone: "Telefone da barbearia",
  instagram: "Instagram",
};

function Comunicacao() {
  const api = useApiDoPainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const { decididas, marcar } = useAreasDecididas(barbearia.dados?.areasDecididas);
  const [telefone, setTelefone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [original, setOriginal] = useState<Contatos | null>(null);
  const [erro, setErro] = useState<Record<string, string | undefined>>({});
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado na renderização, e não num efeito: ver o comentário de
  // DadosDoNegocio (corrida do 181514d).
  const [sincronizada, setSincronizada] = useState<typeof barbearia.dados>(null);
  if (barbearia.dados && barbearia.dados !== sincronizada) {
    setSincronizada(barbearia.dados);
    const lidos: Contatos = {
      telefone: barbearia.dados.telefone ?? "",
      whatsapp: barbearia.dados.whatsapp ?? "",
      instagram: barbearia.dados.instagram ?? "",
    };
    setOriginal(lidos);
    voltarPara(lidos);
  }

  function voltarPara(contatos: Contatos) {
    setTelefone(contatos.telefone);
    setWhatsapp(contatos.whatsapp);
    setInstagram(contatos.instagram);
    setErro({});
  }

  const atuais: Contatos = { telefone, whatsapp, instagram };
  const mudancas = original
    ? (Object.keys(ROTULO) as (keyof Contatos)[])
        .filter((campo) => atuais[campo] !== original[campo])
        .map((campo) => ROTULO[campo])
    : [];

  async function salvar() {
    if (salvando) return;
    setAviso(undefined);
    setErro({});
    // O @ que a pessoa digita por hábito sai aqui; uma URL inteira não é
    // aceita (a API recusaria com 400), e o aviso diz o que pôr.
    const arroba = instagram.trim().replace(/^@/, "");
    if (arroba && !new RegExp(PADRAO_INSTAGRAM).test(arroba)) {
      setErro({ instagram: "Só o @ do Instagram, sem o link: algo como gr.barber" });
      return;
    }
    // Um telefone de cada vez, pra o erro cair no campo certo.
    let telefones: { telefone: string | null; whatsapp: string | null };
    try {
      telefones = { telefone: telefoneOuNulo(telefone), whatsapp: null };
    } catch (causa) {
      if (causa instanceof TelefoneInvalido) {
        setErro({ telefone: MENSAGEM_DO_TELEFONE });
        return;
      }
      throw causa;
    }
    try {
      telefones.whatsapp = telefoneOuNulo(whatsapp);
    } catch (causa) {
      if (causa instanceof TelefoneInvalido) {
        setErro({ whatsapp: MENSAGEM_DO_TELEFONE });
        return;
      }
      throw causa;
    }

    setSalvando(true);
    try {
      await api.barbeiro.atualizarMinhaBarbearia({ ...telefones, instagram: arroba || null });
      // O que ficou gravado, no formato da API: a barra some e o campo
      // mostra o número como o cliente vai ver.
      const gravados: Contatos = {
        telefone: telefones.telefone ?? "",
        whatsapp: telefones.whatsapp ?? "",
        instagram: arroba,
      };
      setOriginal(gravados);
      voltarPara(gravados);
      marcar("comunicacao");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  if (barbearia.erro) {
    return <Aviso>{barbearia.erro.mensagem || "Não foi possível carregar a barbearia agora."}</Aviso>;
  }
  if (!barbearia.dados) return <Carregando />;

  return (
    <MolduraDaArea area="comunicacao" decididas={decididas}>
      {/* A seção na largura toda, com os três campos lado a lado (as
          telas usam a largura — pedido do dono). */}
      <div className={estilos.ladoALado}>
        <Secao
          titulo="Como o cliente fala com você"
          descricao="Aparece na sua página pública, no bloco de contato. Deixe em branco o que não quiser mostrar."
        >
          <div className={estilos.camposLadoALado}>
            <Campo
              rotulo="WhatsApp"
              formato="telefone"
              valor={whatsapp}
              onChange={setWhatsapp}
              erro={erro.whatsapp}
            />
            <Campo
              rotulo="Telefone da barbearia"
              formato="telefone"
              valor={telefone}
              onChange={setTelefone}
              erro={erro.telefone}
            />
            <Campo
              rotulo="Instagram"
              apoio="Só o @, sem o link. Exemplo: gr.barber"
              autoComplete="off"
              valor={instagram}
              onChange={setInstagram}
              erro={erro.instagram}
            />
          </div>
        </Secao>
      </div>

      {/* Um Salvar só, na barra do pé (redesenho, PR 7), como nas outras
          áreas. */}
      <BarraDeMudancas
        mudancas={mudancas}
        pendente={!decididas.includes("comunicacao")}
        aviso={aviso}
        salvando={salvando}
        aoSalvar={() => void salvar()}
        aoDescartar={() => original && voltarPara(original)}
      />
    </MolduraDaArea>
  );
}
