# File Backup (Figma Plugin)

Plugin para Figma que exporta a estrutura completa do arquivo atual
(paginas, camadas e metadados) para um arquivo `.json` local, servindo como
backup rapido do documento.

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
- **networkAccess restrito** no `manifest.json` (`"allowedDomains": ["none"]`):
  o plugin nao acessa a rede, reduzindo superficie de risco na revisao da
  Figma Community.

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
