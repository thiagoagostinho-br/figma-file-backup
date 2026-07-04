import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { SELECTORS, TEXT_PATTERNS } from "./selectors.js";

const PROFILE_DIR = path.join(os.homedir(), ".figma-backup-helper", "browser-profile");
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), "Figma Backups");

let state = {
  status: "idle",
  message: "",
  processed: 0,
  total: 0,
  errors: [],
};

let cancelRequested = false;

export function getStatus() {
  return state;
}

export function cancelBackup() {
  cancelRequested = true;
}

function setState(partial) {
  state = { ...state, ...partial };
}

async function ensureLoggedIn(page) {
  await page.goto("https://www.figma.com/files/recent", { waitUntil: "domcontentloaded" });

  if (page.url().includes("/login")) {
    setState({
      status: "waiting-login",
      message: "Faca login na janela do navegador que abriu. O backup continua sozinho depois disso.",
    });

    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 0 });
  }
}

async function discoverFiles(page, teamId) {
  await page.goto(`https://www.figma.com/files/team/${teamId}`, { waitUntil: "networkidle" });

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

export async function runBackup({ teamIds, outputDir }) {
  cancelRequested = false;
  const targetDir = outputDir || DEFAULT_OUTPUT_DIR;
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  setState({ status: "running", message: "Abrindo navegador...", processed: 0, total: 0, errors: [] });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await ensureLoggedIn(page);
    setState({ status: "running", message: "Descobrindo arquivos..." });

    const errors = [];
    const allFiles = [];

    for (const teamId of teamIds) {
      if (cancelRequested) break;
      try {
        const files = await discoverFiles(page, teamId);
        allFiles.push(...files.map((f) => ({ ...f, teamId })));
      } catch (error) {
        errors.push(`Time ${teamId}: ${error instanceof Error ? error.message : "erro ao listar arquivos"}`);
      }
    }

    setState({ total: allFiles.length });

    let processed = 0;
    for (const file of allFiles) {
      if (cancelRequested) break;

      const safeName = file.name.replace(/[^a-z0-9-_]+/gi, "_") || "arquivo";
      const teamDir = path.join(targetDir, file.teamId);
      fs.mkdirSync(teamDir, { recursive: true });
      const outputPath = path.join(teamDir, `${safeName}.fig`);

      setState({ message: `Baixando ${file.name}...` });

      try {
        const fileUrl = file.href.startsWith("http") ? file.href : `https://www.figma.com${file.href}`;
        await saveLocalCopy(page, fileUrl, outputPath);
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "erro ao salvar"}`);
      }

      processed += 1;
      setState({ processed });
    }

    setState({
      status: cancelRequested ? "cancelled" : "done",
      message: cancelRequested ? "Cancelado pelo usuario." : "Backup concluido.",
      errors,
    });
  } catch (error) {
    setState({
      status: "error",
      message: error instanceof Error ? error.message : "Erro inesperado",
    });
  } finally {
    await context.close();
  }
}
