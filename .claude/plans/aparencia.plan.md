# Plan: Aparência — o visual da página pública por barbearia

**Referência:** o guia "Barbeiro.app — Tela Aparência" e as 21 prints que o dono mandou em 2026-10-11 (ficam fora do repo, em Downloads). A referência é cheia de caixas; aqui vale o combinado da casa: sem caixas, título pequeno, pílulas, Salvar/Publicar só quando muda.

**Rota:** `/painel/configuracoes/aparencia` (só o dono). Nova área `aparencia` em `AREAS_DE_CONFIGURACAO`, no grupo "Canais com clientes" — o índice passa de 5 pra 6 áreas.

## Regra que manda em tudo

Barbearia que nunca abriu a Aparência continua **exatamente** como hoje: amarelo e papel, títulos em Clash e corpo em Inter, borda de 2px e sombra deslocada, serviços em seções por categoria. O visual de hoje vira o tema **BarChop** (o padrão), e o primeiro teste é: sem configuração salva, os mesmos tokens e nenhum `<style>` a mais.

## Como funciona por dentro

- **Dado:** uma coluna JSON `aparencia` (nula = BarChop puro) com o que foi publicado: tema, cor da marca, fundo (claro/escuro), modo padrão (claro/escuro/automático), deixar o cliente trocar, fonte, títulos em outra fonte, tamanho do texto, cantos, botão, cards, as nove cores por modo e o layout dos serviços. A API valida tudo com listas fechadas e hex estrito (`^#[0-9A-F]{6}$`); o web aceita valor ausente ou desconhecido e cai no padrão (lição do #104: o web sobe antes do `migrar`).
- **Paleta:** função pura (pacote `formato` ou `design-tokens`) que recebe a aparência e devolve as cores dos dois modos. Texto sobre a cor da marca e cartões, bordas e textos sobre o fundo calculados por contraste WCAG (≥ 4,5:1). No escuro, o que não foi definido sai do claro. Token novo pro texto sobre o accent (hoje `--cor-dark`), com o mesmo valor de hoje pro painel não mudar.
- **Marca usada como texto (obrigatório no marco C):** o `onAccent` só garante o texto *sobre* a marca. A página pública também usa `--cor-accent` como cor de texto (`PerfilDaBarbearia.module.css`, no bloco escuro) e o botão "Contorno" do marco G põe a marca como texto sobre o fundo — Cítrico (amarelo no claro) e Gentleman/Minimalista (quase preto sobre `--cor-dark`) ficariam ilegíveis. O C levanta todos os usos de `--cor-accent` como `color`/`border` e cria o token derivado da marca como texto, com teste de ≥ 4,5:1 contra o fundo onde ele é usado, em todos os temas.
- **Aplicação:** `<style>` gerado no servidor em `(publico)/[slug]/layout.tsx`, no `:root` e nos blocos escuros no mesmo formato do `tokens-css.ts` — vale pra página e pro fluxo de agendar inteiro. Nada de texto cru no CSS: hex revalidado e cada opção vira um trecho fixo.
- **Modo padrão:** claro ou escuro fixo saem direto no `<style>`; automático segue o sistema, como hoje. A escolha do visitante (botão lua/sol) fica numa chave por barbearia, nunca na `painel.tema` (regra do #96).
- **Fontes:** Roboto, Poppins, Montserrat, Open Sans e Lato self-hosted em `barchop/font/` (recorte latino + licença OFL, como a Inter do #103), carregadas só na página pública.
- **Publicar (decidido pelo dono em 2026-10-11):** rascunho guardado no servidor até o dono publicar ou descartar — sobrevive a fechar a aba e a trocar de computador. Duas colunas: `aparencia` (no ar) e `aparencia_rascunho` (nula = nada pendente). Cada mudança na tela grava o rascunho; a prévia acompanha ao vivo; a barra flutuante "Publicar / Descartar" aparece enquanto houver rascunho diferente do que está no ar. Publicar copia o rascunho pro ar e limpa; Descartar só limpa. Logo/capa e o layout dos serviços salvam direto no ar.
- **Prévia:** iframe da página de verdade (Celular/Computador precisa das media queries do viewport). Em produção é cross-origin (`painel.` → `<slug>.`): o rascunho vai por `postMessage`, com a origem conferida dos dois lados; nunca pela URL (viraria link de página falsificada). Abas só do que existe (Início e o agendar). Sem Assinaturas, Loja nem barra do proprietário.

## Marcos (um PR cada, RED → GREEN)

| # | Marco | Toca | Migração |
|---|-------|------|----------|
| A | Paleta pura + catálogo dos temas (BarChop + os da referência, descrições nossas) | pacote | — |
| B | Colunas `aparencia` e `aparencia_rascunho`; rotas de rascunho, publicar e descartar; aparência na leitura pública e do painel; cliente e dublê | API, banco, api-client | **sim** (`migrar` rebuildado) |
| C | Página pública aplica a aparência publicada + botão claro/escuro do visitante | web público | — |
| D | Tela Aparência: blocos 1 (atalhos pra Marca), 2 (temas, modo) e 3 (cor da marca, fundo) + barra Publicar + área `aparencia` (formato, API marca no publicar, entrada no índice) | web painel, formato, API | — |
| E | Prévia ao vivo em iframe (celular/computador, claro/escuro, ampliar, abrir a página) | web | — |
| F | A letra: as seis fontes + títulos em outra fonte + tamanho do texto | web, `font/` | — |
| G | Ajuste fino: cantos, botão principal, cards, as nove cores | web | — |
| H | Layout dos serviços: abas de categoria × lista agrupada (salva na hora) | web, API | talvez |

**Armadilhas entre marcos (anotadas no B):**
- **H — o que salva na hora:** o rascunho é sempre o objeto inteiro. Se o layout dos serviços (ou qualquer outra coisa "salva na hora") for direto pro `aparencia` com um rascunho pendente, o próximo Publicar devolve o valor antigo. Quem salva direto grava também no rascunho pendente, com teste "salvar layout com rascunho pendente → publicar mantém o layout novo".
- **C — cache:** o layout público lê o perfil com `fetch` num server component, e o cache do `fetch` muda nesta versão do Next (ver `node_modules/next/dist/docs`). Ler antes do C; a conferência é: publicar e, num reload simples da página pública, ver o visual novo.

**Fora por enquanto:** Histórico de alterações (não existe em área nenhuma; seria infraestrutura própria, vale pras Configurações todas).

**Conferir no navegador:** 375 e 1440, claro e escuro, com e sem aparência salva; o fluxo de agendar com tema escuro e cor clara (contraste).
