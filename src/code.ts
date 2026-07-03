figma.showUI(__html__, { width: 320, height: 420 });

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

type UiMessage = { type: "start-backup" } | { type: "close" };

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

async function runBackup(): Promise<void> {
  await figma.loadAllPagesAsync();

  const payload: BackupPayload = {
    fileName: figma.root.name,
    exportedAt: new Date().toISOString(),
    pages: figma.root.children.map(serializeNode),
  };

  figma.ui.postMessage({ type: "backup-ready", payload });
}

figma.ui.onmessage = (msg: UiMessage) => {
  if (msg.type === "start-backup") {
    runBackup().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      figma.ui.postMessage({ type: "backup-error", message });
    });
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};
