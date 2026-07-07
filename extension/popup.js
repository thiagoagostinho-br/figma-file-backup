const fileUrlInput = document.getElementById("fileUrlInput");
const findFilesBtn = document.getElementById("findFilesBtn");
const discoveryStatus = document.getElementById("discoveryStatus");

const fileListWrap = document.getElementById("fileListWrap");
const fileListEl = document.getElementById("fileList");
const selectAll = document.getElementById("selectAll");
const startBackupBtn = document.getElementById("startBackup");
const cancelBackupBtn = document.getElementById("cancelBackup");
const backupStatus = document.getElementById("backupStatus");

let discoveredFiles = [];

function isValidFigmaFileUrl(url) {
  return /figma\.com\/(?:file|design)\/[a-zA-Z0-9]+/.test(url);
}

function renderFileList(files) {
  discoveredFiles = files;
  fileListWrap.style.display = "block";
  fileListEl.innerHTML = files
    .map(
      (f, i) => `
      <label>
        <input type="checkbox" class="fileCheckbox" data-index="${i}" />
        <span>${f.name}</span>
        <span style="color:#999; font-size:10px; margin-left:auto">${f.project || ""}</span>
      </label>`
    )
    .join("");

  document.querySelectorAll(".fileCheckbox").forEach((cb) => {
    cb.addEventListener("change", updateStartButtonState);
  });
}

function updateStartButtonState() {
  const anyChecked = Array.from(document.querySelectorAll(".fileCheckbox")).some((cb) => cb.checked);
  startBackupBtn.disabled = !anyChecked;
}

selectAll.onchange = () => {
  document.querySelectorAll(".fileCheckbox").forEach((cb) => {
    cb.checked = selectAll.checked;
  });
  updateStartButtonState();
};

function renderState(state) {
  if (state.phase === "discovering") {
    findFilesBtn.disabled = true;
    discoveryStatus.className = "status";
    discoveryStatus.textContent = state.message;
  }

  if (state.phase === "ready") {
    findFilesBtn.disabled = false;
    if (state.files && state.files.length > 0) {
      discoveryStatus.textContent = "";
      renderFileList(state.files);
    } else {
      discoveryStatus.className = "status error";
      discoveryStatus.textContent = (state.errors || []).length
        ? `Nenhum arquivo encontrado. ${state.errors.join(" / ")}`
        : "Nenhum arquivo encontrado.";
    }
  }

  if (state.phase === "downloading") {
    startBackupBtn.disabled = true;
    cancelBackupBtn.style.display = "block";
    backupStatus.className = "status";
    backupStatus.textContent =
      state.total > 0 ? `${state.message} (${state.processed}/${state.total})` : state.message;
  }

  if (state.phase === "done" || state.phase === "cancelled" || state.phase === "error") {
    findFilesBtn.disabled = false;
    cancelBackupBtn.style.display = "none";
    if (state.phase === "error" && (!state.files || state.files.length === 0)) {
      discoveryStatus.className = "status error";
      discoveryStatus.textContent = `Erro: ${state.message}`;
    } else {
      updateStartButtonState();
      backupStatus.className = state.phase === "error" ? "status error" : "status";
      backupStatus.textContent = state.message;
      if (state.errors && state.errors.length) {
        console.error(state.errors);
        backupStatus.textContent += ` — ${state.errors.length} erro(s) (veja o console)`;
      }
    }
  }
}

findFilesBtn.onclick = () => {
  const url = fileUrlInput.value.trim();
  if (!isValidFigmaFileUrl(url)) {
    discoveryStatus.className = "status error";
    discoveryStatus.textContent = "Link invalido. Copie o link do arquivo pelo Figma (Copy link).";
    return;
  }

  chrome.runtime.sendMessage({ type: "START_DISCOVERY", fileUrl: url });
};

startBackupBtn.onclick = () => {
  const hrefs = Array.from(document.querySelectorAll(".fileCheckbox"))
    .filter((cb) => cb.checked)
    .map((cb) => discoveredFiles[Number(cb.dataset.index)].href);

  if (hrefs.length === 0) return;

  chrome.runtime.sendMessage({ type: "START_DOWNLOAD", hrefs });
};

cancelBackupBtn.onclick = () => {
  chrome.runtime.sendMessage({ type: "CANCEL" });
};

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_UPDATE") {
    renderState(message.state);
  }
});

chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
  if (state) renderState(state);
});
