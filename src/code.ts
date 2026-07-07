figma.showUI(__html__, { width: 360, height: 480 });

type UiMessage = { type: "close" };

figma.ui.onmessage = (msg: UiMessage) => {
  if (msg.type === "close") {
    figma.closePlugin();
  }
};
