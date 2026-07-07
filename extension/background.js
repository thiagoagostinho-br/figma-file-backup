// Service worker - orquestra abas e mensagens com o content script.
// phase: idle | discovering | ready | downloading | done | error | cancelled
let jobState = {
  phase: "idle",
  message: "",
  processed: 0,
  total: 0,
  files: [],
  teamId: null,
  errors: [],
};

let cancelRequested = false;
let pendingDownloadMeta = null;

function setState(partial) {
  jobState = { ...jobState, ...partial };
  chrome.runtime.sendMessage({ type: "STATE_UPDATE", state: jobState }).catch(() => {});
}

function sendMessageToTab(tabId, message, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout aguardando resposta do content script")),
      timeoutMs
    );
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// O editor do Figma (pesado, motor de canvas) pode demorar bastante pra
// carregar, e o Chrome desacelera abas em segundo plano -- por isso o
// numero alto de tentativas aqui (ate 45s no total).
async function waitForTabReady(tabId, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await sendMessageToTab(tabId, { type: "PING" }, 2000);
      if (res && res.ok) return true;
    } catch {
      // content script ainda nao injetado nessa navegacao, tenta de novo
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

async function openTabAndWait(url) {
  console.log(`[figma-backup] abrindo aba: ${url}`);
  const tab = await chrome.tabs.create({ url, active: false });
  const ready = await waitForTabReady(tab.id);
  if (!ready) {
    console.error(`[figma-backup] timeout esperando content script em: ${url} (tab ${tab.id})`);
    await chrome.tabs.remove(tab.id).catch(() => {});
    throw new Error(`Nao foi possivel carregar ${url}`);
  }
  console.log(`[figma-backup] aba pronta: ${url} (tab ${tab.id})`);
  return tab;
}

async function discoverTeamFromFile(fileUrl) {
  const fileTab = await openTabAndWait(fileUrl);
  try {
    console.log("[figma-backup] procurando link do projeto na pagina do arquivo...");
    const { projectHref } = await sendMessageToTab(fileTab.id, { type: "FIND_TEAM_PROJECT_LINKS" });
    if (!projectHref) throw new Error("Projeto nao encontrado no arquivo atual (selector desatualizado?).");
    console.log(`[figma-backup] projeto encontrado: ${projectHref}`);

    const projectUrl = projectHref.startsWith("http") ? projectHref : `https://www.figma.com${projectHref}`;
    await chrome.tabs.update(fileTab.id, { url: projectUrl });
    await waitForTabReady(fileTab.id);

    console.log("[figma-backup] procurando link do time na pagina do projeto...");
    const { teamHref } = await sendMessageToTab(fileTab.id, { type: "FIND_TEAM_PROJECT_LINKS" });
    if (!teamHref) throw new Error("Time nao encontrado no projeto atual (selector desatualizado?).");

    const match = teamHref.match(/\/files\/team\/(\d+)/);
    if (!match) throw new Error(`ID do time nao reconhecido na URL: ${teamHref}`);
    console.log(`[figma-backup] time identificado: ${match[1]}`);

    return { teamId: match[1], tabId: fileTab.id };
  } catch (error) {
    await chrome.tabs.remove(fileTab.id).catch(() => {});
    throw error;
  }
}

async function discoverFilesViaContributions(tabId, teamId) {
  await chrome.tabs.update(tabId, { url: `https://www.figma.com/files/team/${teamId}` });
  await waitForTabReady(tabId);
  await new Promise((r) => setTimeout(r, 1000));

  console.log("[figma-backup] clicando em Membros...");
  const membersResult = await sendMessageToTab(tabId, { type: "CLICK_MEMBERS" });
  if (!membersResult.ok) throw new Error("Nao encontrou o menu de Membros (selector desatualizado?).");
  await new Promise((r) => setTimeout(r, 800));

  console.log("[figma-backup] clicando na propria conta...");
  const selfResult = await sendMessageToTab(tabId, { type: "CLICK_SELF_MEMBER" });
  if (!selfResult.ok) {
    throw new Error("Nao encontrou sua propria conta na lista de membros (selector desatualizado?).");
  }
  await new Promise((r) => setTimeout(r, 800));

  console.log("[figma-backup] clicando em File contributions...");
  const contribResult = await sendMessageToTab(tabId, { type: "CLICK_FILE_CONTRIBUTIONS" });
  if (!contribResult.ok) throw new Error("Aba 'File contributions' nao encontrada (selector desatualizado?).");
  await new Promise((r) => setTimeout(r, 1200));

  const { files } = await sendMessageToTab(tabId, { type: "SCRAPE_FILES" });
  console.log(`[figma-backup] File contributions: ${files.length} arquivo(s) encontrado(s).`);
  return files;
}

async function discoverDraftFiles(tabId) {
  await chrome.tabs.update(tabId, { url: "https://www.figma.com/files/recent" });
  await waitForTabReady(tabId);
  await new Promise((r) => setTimeout(r, 1000));
  const { files } = await sendMessageToTab(tabId, { type: "SCRAPE_FILES" });
  console.log(`[figma-backup] Drafts: ${files.length} arquivo(s) encontrado(s).`);
  return files;
}

async function runDiscovery(fileUrl) {
  cancelRequested = false;
  setState({
    phase: "discovering",
    message: "Abrindo aba...",
    processed: 0,
    total: 0,
    files: [],
    teamId: null,
    errors: [],
  });

  let tabId;
  try {
    setState({ message: "Identificando o time do arquivo atual..." });
    const result = await discoverTeamFromFile(fileUrl);
    tabId = result.tabId;
    const teamId = result.teamId;

    const errors = [];
    let contributionFiles = [];
    let draftFiles = [];

    setState({ message: "Buscando seus arquivos no time (File Contributions)..." });
    try {
      const files = await discoverFilesViaContributions(tabId, teamId);
      contributionFiles = files.map((f) => ({ ...f, project: `Time ${teamId}` }));
    } catch (error) {
      errors.push(`Time ${teamId}: ${error.message}`);
    }

    if (!cancelRequested) {
      setState({ message: "Buscando arquivos em Drafts..." });
      try {
        const files = await discoverDraftFiles(tabId);
        draftFiles = files.map((f) => ({ ...f, project: "Drafts" }));
      } catch (error) {
        errors.push(`Drafts: ${error.message}`);
      }
    }

    await chrome.tabs.remove(tabId).catch(() => {});

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
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
    setState({ phase: "error", message: error.message });
  }
}

chrome.downloads.onDeterminingFilename.addListener((_downloadItem, suggest) => {
  if (!pendingDownloadMeta) return;
  const safeProject = (pendingDownloadMeta.project || "Outros").replace(/[^a-z0-9-_ ]+/gi, "_");
  const safeName = (pendingDownloadMeta.name || "arquivo").replace(/[^a-z0-9-_]+/gi, "_");
  suggest({ filename: `Figma Backups/${safeProject}/${safeName}.fig`, conflictAction: "uniquify" });
});

async function downloadOneFile(fileUrl, name, project) {
  const tab = await openTabAndWait(fileUrl);
  try {
    pendingDownloadMeta = { name, project };

    const downloadPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout esperando o download iniciar")), 30000);
      const listener = (downloadItem) => {
        clearTimeout(timer);
        chrome.downloads.onCreated.removeListener(listener);
        resolve(downloadItem);
      };
      chrome.downloads.onCreated.addListener(listener);
    });

    const result = await sendMessageToTab(tab.id, { type: "SAVE_LOCAL_COPY" }, 15000);
    if (!result.ok) throw new Error(result.message || "Falha ao acionar Save local copy");

    await downloadPromise;
  } finally {
    pendingDownloadMeta = null;
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function runDownload(hrefs) {
  cancelRequested = false;
  const hrefSet = new Set(hrefs);
  const selected = jobState.files.filter((f) => hrefSet.has(f.href));

  setState({ phase: "downloading", total: selected.length, processed: 0, message: "Iniciando downloads..." });

  const errors = [];
  let processed = 0;

  for (const file of selected) {
    if (cancelRequested) break;
    setState({ message: `Baixando ${file.name}...` });

    try {
      const fileUrl = file.href.startsWith("http") ? file.href : `https://www.figma.com${file.href}`;
      await downloadOneFile(fileUrl, file.name, file.project);
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    }

    processed += 1;
    setState({ processed });
  }

  setState({
    phase: cancelRequested ? "cancelled" : "done",
    message: cancelRequested ? "Cancelado pelo usuario." : "Backup concluido.",
    errors,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse(jobState);
    return true;
  }

  if (message.type === "START_DISCOVERY") {
    runDiscovery(message.fileUrl);
    sendResponse({ started: true });
    return true;
  }

  if (message.type === "START_DOWNLOAD") {
    runDownload(message.hrefs);
    sendResponse({ started: true });
    return true;
  }

  if (message.type === "CANCEL") {
    cancelRequested = true;
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
