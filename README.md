# File Backup (Figma Plugin)

Plugin para Figma com tres funcionalidades de backup:

1. **Arquivo atual**: exporta a estrutura do documento aberto (paginas,
   camadas e metadados) para um `.json` local. Nao requer configuracao.
2. **Times/Projetos via API**: usando um Personal Access Token, baixa o
   JSON completo (`document`) de todos os arquivos dos times informados,
   percorrendo `teams → projects → files` pela REST API do Figma.
3. **Backup Completo (.fig)**: aciona um helper local (`helper/`, Node +
   Playwright) que abre uma janela de navegador e automatiza o "Save local
   copy" arquivo por arquivo, baixando o `.fig` nativo de verdade. Veja
   [helper/README](#backup-completo-fig-via-helper-local) abaixo.

### Limitacoes conhecidas (da propria plataforma Figma, nao deste plugin)

- **Sem endpoint de API para `.fig` nativo**: a REST API do Figma nao expõe
  nenhum jeito de baixar o binario `.fig` diretamente. O backup de
  Times/Projetos (opcao 2) gera JSON (estrutura completa de nos, estilos,
  texto) — util para inspecao/versionamento, mas nao reabrivel com duplo
  clique. Para o `.fig` real, a opcao 3 (helper local) automatiza a unica
  via que existe: **File → Save local copy** dentro do proprio Figma.
- **Sem drafts pessoais**: arquivos fora de times/projetos (drafts) nao sao
  acessiveis por nenhum endpoint publico nem pela navegacao do helper de
  forma confiavel. Nao ha workaround.
- **Sem listagem automatica de times**: a API nao tem endpoint para listar
  os times do usuario — o `team_id` precisa ser copiado manualmente da URL
  do time no Figma (`figma.com/files/team/<team_id>/...`).
- **Automacao de UI é fragil por natureza**: o helper local (opcao 3)
  navega e clica na interface real do Figma, cujas classes CSS mudam a
  cada deploy deles. Os seletores usados (`helper/src/selectors.js`) usam
  texto/atributos mais estaveis quando possivel, mas podem quebrar sem
  aviso se o Figma mudar a UI — se isso acontecer, o ajuste comeca nesse
  arquivo.

## Requisitos

- [Node.js](https://nodejs.org/) 20+
- [Figma Desktop App](https://www.figma.com/downloads/)

## Setup

```bash
npm install
npm run build
```

O build gera os arquivos `dist/code.js` e `dist/ui.html`, referenciados pelo
`manifest.json`.

## Desenvolvimento

```bash
npm run watch
```

Mantem o `code.ts` recompilando a cada alteracao. Em outro terminal, abra o
Figma Desktop e importe o plugin:

1. Menu **Plugins > Development > Import plugin from manifest...**
2. Selecione o arquivo `manifest.json` na raiz deste projeto.
3. Rode o plugin via **Plugins > Development > File Backup**.

Na primeira importacao o Figma pode adicionar automaticamente um campo `id`
ao `manifest.json` — nao remova esse campo depois disso, ele identifica o
plugin no seu ambiente de desenvolvimento.

### Usando o backup de Times/Projetos

1. Gere um Personal Access Token em **Figma → Settings → Security →
   Personal access tokens** (escopo de leitura de arquivos ja é suficiente).
2. Copie o(s) `team_id` pela URL do time no Figma.
3. Na UI do plugin, cole o token e os team IDs (um por linha ou separados
   por virgula) e clique em **Iniciar Backup de Times**.
4. O token e os IDs ficam salvos localmente via `figma.clientStorage`
   (por maquina/instalacao, nao sincroniza entre dispositivos) para nao
   precisar redigitar a cada uso.
5. O resultado é um unico `.json` contendo todos os times, projetos e
   arquivos baixados, mais quaisquer erros por time (ex.: token sem acesso
   a um time especifico) reportados sem interromper o restante do backup.

**Seguranca**: o token dá acesso de leitura à sua conta Figma inteira
(conforme o escopo escolhido). Nunca compartilhe esse token nem o commite
em nenhum repositorio.

### Backup Completo (.fig) via helper local

O plugin sozinho (rodando dentro do app Desktop ou do navegador) nunca tem
acesso para clicar em "Save local copy" na interface do Figma — plugins
rodam sempre num iframe isolado (sandbox), sem esse tipo de permissao,
independente de onde rodam. Por isso essa automacao precisa de um processo
separado no seu computador: o helper local em `helper/`.

**Setup (uma vez), forma recomendada — dois cliques:**

De dois cliques em `helper/start.command` no Finder. Ele detecta sozinho o
que falta (dependencias, navegador do Playwright) e so instala na primeira
vez; nas proximas, so sobe o servidor direto. Deixe essa janela do Terminal
aberta enquanto for usar a opcao "Backup Completo (.fig)" no plugin.

Isso funciona porque `start.command` roda fora do plugin, diretamente no
seu Mac — o plugin em si nao tem permissao para abrir terminal nem instalar
nada (mesmo sandbox que impede a automacao direta do "Save local copy").

**Alternativa manual** (equivalente ao que o `start.command` faz):

```bash
cd helper
npm install
npm run install-browsers   # baixa o Chromium usado pelo Playwright
npm start                  # sobe o servidor em http://localhost:8722
```

**Uso:**

1. Preencha os Team IDs na secao "Times / Projetos" da UI (o campo é
   compartilhado com a opcao 3).
2. Clique em **Iniciar Backup Completo (.fig)**. O plugin detecta se esta
   rodando no app Desktop ou no navegador (deteccao best-effort via user
   agent — o Figma nao tem uma API oficial pra isso) e ajusta a mensagem,
   mas em ambos os casos apenas aciona o helper local via `fetch` para
   `http://localhost:8722/start`.
3. Uma janela de navegador separada abre (controlada pelo Playwright). No
   primeiro uso, faca login manualmente nela — a sessao fica salva em
   `~/.figma-backup-helper/browser-profile` para as proximas vezes.
4. O helper navega por cada time/projeto/arquivo, aciona "Save local copy"
   e salva os `.fig` em `~/Figma Backups/<team_id>/<arquivo>.fig`.
5. Progresso e erros aparecem na UI do plugin (poll em `/status` a cada
   1.5s). Da pra cancelar a qualquer momento.

## Scripts

| Comando            | Descricao                                  |
| ------------------ | ------------------------------------------- |
| `npm run build`     | Compila e minifica `code.ts`, copia `ui.html` |
| `npm run watch`     | Rebuild automatico durante o desenvolvimento |
| `npm run typecheck` | Checagem de tipos sem gerar arquivos         |
| `npm run lint`      | Lint com as regras oficiais de plugins Figma |

## Estrutura

```
.
├── manifest.json        # Manifesto do plugin (lido pelo Figma)
├── src/
│   ├── code.ts           # Logica principal (thread do plugin)
│   └── ui.html            # Interface exibida ao usuario
├── helper/                # Helper local (Node + Playwright) p/ backup .fig
│   ├── package.json
│   └── src/
│       ├── server.js       # HTTP local (start/status/cancel)
│       ├── automation.js   # Automacao Playwright (login, navegacao, save)
│       └── selectors.js     # Seletores isolados (ponto de ajuste se quebrar)
├── dist/                  # Saida do build (gerado, nao versionado)
└── .github/workflows/ci.yml  # Pipeline de lint/typecheck/build
```

---

## Passo a passo: publicar no GitHub

1. **Criar o repositorio remoto** em https://github.com/new
   - Nome sugerido: `figma-file-backup`
   - Visibilidade: publica (necessaria para o link do repo aparecer na
     listagem da Figma Community, opcional) ou privada, como preferir.
   - **Nao** marque "Add a README" nem `.gitignore` (ja existem localmente).

2. **Conectar o repositorio local** (a partir da pasta `Figbkp`):

   ```bash
   git remote add origin git@github.com:<seu-usuario>/figma-file-backup.git
   git branch -M main
   git push -u origin main
   ```

   Use a URL HTTPS (`https://github.com/<seu-usuario>/figma-file-backup.git`)
   se nao tiver uma chave SSH configurada no GitHub.

3. **Verificar o CI**: apos o push, va em **Actions** no GitHub e confirme
   que o workflow `CI` passou (lint + typecheck + build).

4. **Proteger a branch `main`** (recomendado, em Settings > Branches):
   - Exigir que o workflow de CI passe antes de merge.
   - Exigir Pull Request para alteracoes diretas em `main`.

## Boas praticas de deploy adotadas

- **CI obrigatorio** (`.github/workflows/ci.yml`): todo push/PR roda lint,
  typecheck e build antes de qualquer merge ser considerado seguro.
- **`dist/` fora do versionamento**: o build e sempre gerado a partir da
  fonte (`src/`), evitando divergencia entre codigo e artefato.
- **Versionamento semantico**: incremente `version` em `package.json` e
  crie uma tag (`git tag vX.Y.Z && git push --tags`) a cada release.
- **networkAccess restrito** no `manifest.json`
  (`"allowedDomains": ["https://api.figma.com", "http://localhost:8722"]`):
  o plugin so pode falar com o dominio oficial da API do Figma e com o
  helper local (que roda na maquina do proprio usuario, na porta fixa
  `8722`) — nada mais.

## Publicar na Figma Community

Plugins Figma nao tem "deploy" automatizado via API — a publicacao e feita
manualmente pelo painel da Figma, mas o CI garante que o build enviado esta
sempre validado.

1. Rode `npm run build` a partir do commit que deseja publicar (idealmente
   uma tag de release, ex.: `v1.0.0`).
2. No Figma Desktop, com o plugin importado localmente, abra
   **Plugins > Development > File Backup**, clique com o botao direito no
   plugin na lista de **Development** e escolha **Publish**.
3. Preencha no painel de publicacao:
   - Nome, icone (128x128), banner de capa, descricao e tags.
   - Capturas de tela mostrando o plugin em uso.
4. Envie para revisao. A Figma analisa manualmente antes de publicar
   plugins na Community — leve alguns dias uteis.
5. Apos aprovado, qualquer atualizacao futura (`npm version patch` + build)
   deve ser reenviada pelo mesmo painel, selecionando **Publish new version**.

## Licenca

MIT — veja [LICENSE](./LICENSE).
