// Selectors isolados aqui porque o Figma usa classes CSS geradas/hasheadas
// que mudam a cada deploy — se a automacao quebrar, o ajuste comeca por aqui.
export const SELECTORS = {
  fileLink: 'a[href*="/file/"], a[href*="/design/"]',
  projectLink: 'a[href*="/files/project/"]',
  teamLink: 'a[href*="/files/team/"]',
  mainMenuButton: '[aria-label="Main Menu" i], [aria-label="Menu principal" i]',
};

export const TEXT_PATTERNS = {
  fileMenu: /^file$/i,
  saveLocalCopy: /save local copy/i,
};
