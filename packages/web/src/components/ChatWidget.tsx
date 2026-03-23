"use client";

import Script from "next/script";

declare global {
  interface Window {
    initWidgetPlatform: (config: { agentId: string; api?: string }) => void;
  }
}

export default function ChatWidget({ agentId }: { agentId?: string } = {}) {
  const widgetAgentId = agentId || "cmn312oog003zo801fi4orctp";

  const scriptUrl = "https://chatapp.engageos.ai/widget/widget.iife.js";

  const initializeWidget = () => {
    setTimeout(() => {
      if (window.initWidgetPlatform) {
        window.initWidgetPlatform({ agentId: widgetAgentId });
      }
    }, 100);
  };

  return (
    <Script
      src={`${scriptUrl}?v=${Date.now()}`}
      strategy="lazyOnload"
      onLoad={initializeWidget}
      onError={() => console.error("Failed to load chat widget")}
    />
  );
}
