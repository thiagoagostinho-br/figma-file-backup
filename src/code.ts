figma.showUI(__html__, { width: 340, height: 520 });

interface SerializedNode {
  id: string;
  name: string;
  type: string;
  children?: SerializedNode[];
}

interface BackupPayload {
  fileName: string;
  exportedAt: string;
  pages: SerializedNode[];
}

interface TeamBackupSettings {
  token: string;
  teamIds: string[];
}

interface FigmaProjectsResponse {
  name: string;
  projects: { id: string; name: string }[];
}

interface FigmaFilesResponse {
  files: { key: string; name: string; last_modified: string }[];
}

interface FigmaFileResponse {
  document: unknown;
}

interface TeamBackupFile {
  key: string;
  name: string;
  lastModified: string;
  document: unknown;
}

interface TeamBackupProject {
  id: string;
  name: string;
  files: TeamBackupFile[];
}

interface TeamBackupTeam {
  id: string;
  name: string;
  projects: TeamBackupProject[];
}

type UiMessage =
  | { type: "start-backup" }
  | { type: "load-team-settings" }
  | { type: "save-team-settings"; token: string; teamIds: string[] }
  | { type: "start-team-backup"; token: string; teamIds: string[] }
  | { type: "close" };

const CLIENT_STORAGE_KEY = "team-backup-settings";
const FIGMA_API_BASE = "https://api.figma.com/v1";

function serializeNode(node: BaseNode): SerializedNode {
  const serialized: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ("children" in node) {
    serialized.children = (node as BaseNode & ChildrenMixin).children.map(serializeNode);
  }

  return serialized;
}

async function runCurrentFileBackup(): Promise<void> {
  await figma.loadAllPagesAsync();

  const payload: BackupPayload = {
    fileName: figma.root.name,
    exportedAt: new Date().toISOString(),
    pages: figma.root.children.map(serializeNode),
  };

  figma.ui.postMessage({ type: "backup-ready", payload });
}

async function figmaApiFetch<T>(path: string, token: string): Promise<T> {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${FIGMA_API_BASE}${path}`, {
      headers: { "X-Figma-Token": token },
    });

    if (response.status === 429) {
      const retryAfterHeader = Number(response.headers.get("Retry-After"));
      const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader
        : attempt * 2;
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      continue;
    }

    if (!response.ok) {
      throw new Error(`${path} -> HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }

  throw new Error(`${path} -> falhou apos ${maxAttempts} tentativas (rate limit)`);
}

async function runTeamBackup(token: string, teamIds: string[]): Promise<void> {
  const teams: TeamBackupTeam[] = [];
  const errors: string[] = [];

  for (const teamId of teamIds) {
    try {
      const projectsRes = await figmaApiFetch<FigmaProjectsResponse>(
        `/teams/${teamId}/projects`,
        token
      );
      const projects: TeamBackupProject[] = [];

      for (const project of projectsRes.projects) {
        const filesRes = await figmaApiFetch<FigmaFilesResponse>(
          `/projects/${project.id}/files`,
          token
        );
        const files: TeamBackupFile[] = [];

        for (const file of filesRes.files) {
          figma.ui.postMessage({
            type: "team-backup-progress",
            message: `Baixando ${project.name} / ${file.name}...`,
          });

          const fileRes = await figmaApiFetch<FigmaFileResponse>(`/files/${file.key}`, token);
          files.push({
            key: file.key,
            name: file.name,
            lastModified: file.last_modified,
            document: fileRes.document,
          });
        }

        projects.push({ id: project.id, name: project.name, files });
      }

      teams.push({ id: teamId, name: projectsRes.name, projects });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      errors.push(`Time ${teamId}: ${message}`);
    }
  }

  figma.ui.postMessage({
    type: "team-backup-ready",
    payload: {
      exportedAt: new Date().toISOString(),
      teams,
    },
    errors,
  });
}

figma.ui.onmessage = (msg: UiMessage) => {
  if (msg.type === "start-backup") {
    runCurrentFileBackup().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      figma.ui.postMessage({ type: "backup-error", message });
    });
  }

  if (msg.type === "load-team-settings") {
    figma.clientStorage
      .getAsync(CLIENT_STORAGE_KEY)
      .then((settings: TeamBackupSettings | undefined) => {
        figma.ui.postMessage({ type: "team-settings-loaded", settings: settings ?? null });
      });
  }

  if (msg.type === "save-team-settings") {
    const settings: TeamBackupSettings = { token: msg.token, teamIds: msg.teamIds };
    figma.clientStorage.setAsync(CLIENT_STORAGE_KEY, settings);
  }

  if (msg.type === "start-team-backup") {
    runTeamBackup(msg.token, msg.teamIds).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      figma.ui.postMessage({ type: "team-backup-error", message });
    });
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};
