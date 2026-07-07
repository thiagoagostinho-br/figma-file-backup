import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { SELECTORS, TEXT_PATTERNS } from "./selectors.js";

const PROFILE_DIR = path.join(os.homedir(), ".figma-backup-helper", "browser-profile");
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), "Figma Backups");

// phase: idle | discovering | ready | downloading | done | cancelled | error
let state = {
  phase: "idle",
  message: "",
  processed: 0,
  total: 0,
  files: [],
  teamId: null,
  errors: [],
};

let cancelRequested = false;
let activeContext = null;
let activePage = null;

export function getStatus() {
  return state;
}

export function cancelBackup() {
  cancelRequested = true;
}

function setState(partial) {
  state = { ...state, ...partial };
}

async function closeBrowser() {
  if (activeContext) {
    await activeContext.close().catch(() => {});
  }
  activeContext = null;
  activePage = null;
}

async function ensureLoggedIn(page) {
  await page.goto("https://www.figma.com/files/recent", { waitUntil: "domcontentloaded" });

  if (page.url().includes("/login")) {
    setState({
      message: "Faca login na janela do navegador que abriu. A busca continua sozinha depois disso.",
    });

    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 0 });
  }
}

async function discoverTeamFromFile(page, fileKey) {
  await page.goto(`https://www.figma.com/file/${fileKey}`, { waitUntil: "networkidle" });

  const projectHref = await page
    .locator(SELECTORS.projectLink)
    .first()
    .getAttribute("href")
    .catch(() => null);

  if (!projectHref) {
    throw new Error("Nao foi possivel identificar o projeto do arquivo atual (selector desatualizado?).");
  }

  const projectUrl = projectHref.startsWith("http")
    ? projectHref
    : `https://www.figma.com${projectHref}`;
  await page.goto(projectUrl, { waitUntil: "networkidle" });

  const teamHref = await page
    .locator(SELECTORS.teamLink)
    .first()
    .getAttribute("href")
    .catch(() => null);

  if (!teamHref) {
    throw new Error("Nao foi possivel identificar o time do arquivo atual (selector desatualizado?).");
  }

  const match = teamHref.match(/\/files\/team\/(\d+)/);
  if (!match) {
    throw new Error(`ID do time nao reconhecido na URL: ${teamHref}`);
  }

  return match[1];
}

async function scrapeFileLinks(page) {
  const links = await page.$$eval(SELECTORS.fileLink, (anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href") || "",
      name: a.textContent?.trim() || "arquivo",
    }))
  );

  const seen = new Set();
  return links.filter((link) => {
    if (!link.href || seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

async function discoverFilesViaContributions(page, teamId) {
  await page.goto(`https://www.figma.com/files/team/${teamId}`, { waitUntil: "networkidle" });

  const teamName = await page.title().then((t) => t.split("–")[0]?.trim() || `Time ${teamId}`);

  await page.getByText(TEXT_PATTERNS.membersEntry).first().click();

  const selfEntry = page.getByText(TEXT_PATTERNS.selfMember).first();
  if (!(await selfEntry.count())) {
    throw new Error(
      "Nao foi possivel identificar sua propria conta na lista de membros (selector desatualizado?)."
    );
  }
  await selfEntry.click();

  const contributionsTab = page.getByText(TEXT_PATTERNS.fileContributions).first();
  if (!(await contributionsTab.count())) {
    throw new Error("Aba 'File contributions' nao encontrada (selector desatualizado?).");
  }
  await contributionsTab.click();
  await page.waitForLoadState("networkidle");

  const files = await scrapeFileLinks(page);
  return files.map((f) => ({ ...f, project: teamName }));
}

async function discoverDraftFiles(page) {
  await page.goto("https://www.figma.com/files/recent", { waitUntil: "networkidle" });
  const files = await scrapeFileLinks(page);
  return files.map((f) => ({ ...f, project: "Drafts" }));
}

async function saveLocalCopy(page, fileUrl, outputPath) {
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.click(SELECTORS.mainMenuButton);

  let saveItem = page.getByText(TEXT_PATTERNS.saveLocalCopy).first();
  if (!(await saveItem.count())) {
    await page.getByText(TEXT_PATTERNS.fileMenu).first().click();
    saveItem = page.getByText(TEXT_PATTERNS.saveLocalCopy).first();
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await saveItem.click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);
}

export async function runDiscovery({ fileKey }) {
  cancelRequested = false;
  setState({
    phase: "discovering",
    message: "Abrindo navegador...",
    processed: 0,
    total: 0,
    files: [],
    teamId: null,
    errors: [],
  });

  try {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    activeContext = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });
    activePage = activeContext.pages()[0] || (await activeContext.newPage());

    await ensureLoggedIn(activePage);
    if (cancelRequested) {
      setState({ phase: "cancelled", message: "Cancelado pelo usuario." });
      await closeBrowser();
      return;
    }

    setState({ message: "Identificando o time do arquivo atual..." });
    const teamId = await discoverTeamFromFile(activePage, fileKey);

    if (cancelRequested) {
      setState({ phase: "cancelled", message: "Cancelado pelo usuario." });
      await closeBrowser();
      return;
    }

    const errors = [];
    let contributionFiles = [];
    let draftFiles = [];

    setState({ message: "Buscando seus arquivos no time (File Contributions)..." });
    try {
      contributionFiles = await discoverFilesViaContributions(activePage, teamId);
    } catch (error) {
      errors.push(
        `Time ${teamId}: ${error instanceof Error ? error.message : "erro ao listar file contributions"}`
      );
    }

    if (cancelRequested) {
      setState({ phase: "cancelled", message: "Cancelado pelo usuario." });
      await closeBrowser();
      return;
    }

    setState({ message: "Buscando arquivos em Drafts..." });
    try {
      draftFiles = await discoverDraftFiles(activePage);
    } catch (error) {
      errors.push(`Drafts: ${error instanceof Error ? error.message : "erro ao listar drafts"}`);
    }

    const seen = new Set();
    const files = [...contributionFiles, ...draftFiles].filter((f) => {
      if (seen.has(f.href)) return false;
      seen.add(f.href);
      return true;
    });

    setState({
      phase: "ready",
      message: `${files.length} arquivo(s) encontrado(s).`,
      files,
      teamId,
      errors,
    });
  } catch (error) {
    setState({
      phase: "error",
      message: error instanceof Error ? error.message : "Erro inesperado ao listar arquivos",
    });
    await closeBrowser();
  }
}

export async function runDownload({ hrefs, outputDir }) {
  if (!activePage || state.phase !== "ready") {
    setState({ phase: "error", message: "Nenhuma lista de arquivos pronta. Refaca a busca." });
    return;
  }

  cancelRequested = false;
  const targetDir = outputDir || DEFAULT_OUTPUT_DIR;

  const hrefSet = new Set(hrefs);
  const selected = state.files.filter((f) => hrefSet.has(f.href));

  setState({ phase: "downloading", total: selected.length, processed: 0, message: "Iniciando downloads..." });

  const errors = [];
  let processed = 0;

  for (const file of selected) {
    if (cancelRequested) break;

    const safeProject = (file.project || "Outros").replace(/[^a-z0-9-_ ]+/gi, "_");
    const safeName = file.name.replace(/[^a-z0-9-_]+/gi, "_") || "arquivo";
    const projectDir = path.join(targetDir, safeProject);
    fs.mkdirSync(projectDir, { recursive: true });
    const outputPath = path.join(projectDir, `${safeName}.fig`);

    setState({ message: `Baixando ${file.name}...` });

    try {
      const fileUrl = file.href.startsWith("http") ? file.href : `https://www.figma.com${file.href}`;
      await saveLocalCopy(activePage, fileUrl, outputPath);
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "erro ao salvar"}`);
    }

    processed += 1;
    setState({ processed });
  }

  setState({
    phase: cancelRequested ? "cancelled" : "done",
    message: cancelRequested ? "Cancelado pelo usuario." : "Backup concluido.",
    errors,
  });

  await closeBrowser();
}
