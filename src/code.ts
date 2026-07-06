figma.showUI(__html__, { width: 340, height: 340 });

type UiMessage = { type: "get-file-context" } | { type: "close" };

figma.ui.onmessage = (msg: UiMessage) => {
  if (msg.type === "get-file-context") {
    figma.ui.postMessage({
      type: "file-context",
      fileKey: figma.fileKey ?? null,
      fileName: figma.root.name,
    });
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};
