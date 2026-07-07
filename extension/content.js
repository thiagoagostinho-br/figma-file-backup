// Content script - roda com acesso real de DOM na pagina do figma.com,
// diferente do plugin (sandbox) e do navegador separado do Playwright.
// Seletores aqui sao o ponto de ajuste se o Figma mudar a UI.

const SELECTORS = {
  fileLink: 'a[href*="/file/"], a[href*="/design/"]',
  projectLink: 'a[href*="/files/project/"]',
  teamLink: 'a[href*="/files/team/"]',
  mainMenuButton: '[aria-label="Main Menu" i], [aria-label="Menu principal" i]',
};

const TEXT_PATTERNS = {
  fileMenu: /^file$/i,
  saveLocalCopy: /save local copy/i,
  membersEntry: /members|membros/i,
  selfMember: /\(you\)|\(voc[eê]\)/i,
  fileContributions: /file contributions/i,
};

function scrapeFileLinks() {
  const anchors = Array.from(document.querySelectorAll(SELECTORS.fileLink));
  const seen = new Set();
  const files = [];

  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const name = a.textContent?.trim() || "arquivo";
    if (!href || seen.has(href)) continue;
    seen.add(href);
    files.push({ href, name });
  }

  return files;
}

function findTeamAndProjectLinks() {
  const projectLink = document.querySelector(SELECTORS.projectLink);
  const teamLink = document.querySelector(SELECTORS.teamLink);
  return {
    projectHref: projectLink ? projectLink.getAttribute("href") : null,
    teamHref: teamLink ? teamLink.getAttribute("href") : null,
  };
}

function findElementByText(pattern, tag = "*") {
  const candidates = document.querySelectorAll(tag);
  for (const el of candidates) {
    const text = el.textContent?.trim() || "";
    if (pattern.test(text) && el.children.length === 0) {
      return el;
    }
  }
  return null;
}

function clickElementByText(pattern) {
  const el = findElementByText(pattern);
  if (!el) return false;
  el.click();
  return true;
}

async function triggerSaveLocalCopy() {
  const menuBtn = document.querySelector(SELECTORS.mainMenuButton);
  if (!menuBtn) {
    throw new Error("Botao de menu principal nao encontrado (selector desatualizado?).");
  }
  menuBtn.click();
  await new Promise((r) => setTimeout(r, 400));

  let clicked = clickElementByText(TEXT_PATTERNS.saveLocalCopy);
  if (!clicked) {
    clickElementByText(TEXT_PATTERNS.fileMenu);
    await new Promise((r) => setTimeout(r, 300));
    clicked = clickElementByText(TEXT_PATTERNS.saveLocalCopy);
  }

  if (!clicked) {
    throw new Error("Item 'Save local copy' nao encontrado (selector desatualizado?).");
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true, url: window.location.href });
    return true;
  }

  if (message.type === "SCRAPE_FILES") {
    sendResponse({ files: scrapeFileLinks() });
    return true;
  }

  if (message.type === "FIND_TEAM_PROJECT_LINKS") {
    sendResponse(findTeamAndProjectLinks());
    return true;
  }

  if (message.type === "CLICK_MEMBERS") {
    sendResponse({ ok: clickElementByText(TEXT_PATTERNS.membersEntry) });
    return true;
  }

  if (message.type === "CLICK_SELF_MEMBER") {
    sendResponse({ ok: clickElementByText(TEXT_PATTERNS.selfMember) });
    return true;
  }

  if (message.type === "CLICK_FILE_CONTRIBUTIONS") {
    sendResponse({ ok: clickElementByText(TEXT_PATTERNS.fileContributions) });
    return true;
  }

  if (message.type === "SAVE_LOCAL_COPY") {
    triggerSaveLocalCopy()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});
