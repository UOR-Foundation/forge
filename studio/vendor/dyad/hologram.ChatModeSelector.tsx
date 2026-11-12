// FoundrySpecification.browserChatModeControlsBoundary.
import { useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useChatMode } from "@/hooks/useChatMode";
import { useIsMac } from "@/hooks/useChatModeToggle";
import { useSettings } from "@/hooks/useSettings";
import type { ChatMode } from "@/lib/schemas";
import { modelSelectionScope } from "./hologram.model-selection.mjs";
import { chatModeCatalog } from "./hologram.chat-mode-data.mjs";

export function ChatModeSelector() {
  const router = useRouter(),
    state = useRouterState(),
    isMac = useIsMac();
  const scope = modelSelectionScope(
    state.location.pathname,
    router.options.basepath,
    state.location.search.id,
  );
  const { chat, selectedMode, setChatMode, isLoading, isUpdating } = useChatMode(
    scope.kind === "chat" ? scope.chatId : null,
  );
  const { settings, updateSettings } = useSettings();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const unavailable =
    scope.kind === "unavailable" ||
    !settings ||
    (scope.kind === "chat" && (isLoading || !chat || isUpdating));
  const supported = chatModeCatalog.modes.some((choice) => choice.id === selectedMode);
  const choose = async (mode: ChatMode) => {
    if (unavailable || busy.current || !chatModeCatalog.modes.some((choice) => choice.id === mode))
      return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      if (scope.kind === "chat") await setChatMode(mode);
      else if (scope.kind === "default")
        await updateSettings({ selectedChatMode: mode, defaultChatMode: mode });
    } catch {
      setError("The chat mode could not be saved. Try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "." ||
        event.altKey ||
        event.shiftKey ||
        !(isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
      )
        return;
      if (unavailable || busy.current) return;
      event.preventDefault();
      const choices = chatModeCatalog.modes,
        index = choices.findIndex((choice) => choice.id === selectedMode);
      void choose(choices[(index + 1) % choices.length].id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    // Every chat builds: the selector is kept for the page's own checks and is not shown, focused or clicked.
    <div className="relative flex w-0 flex-col gap-1">
      <select
        aria-label="Chat mode"
        data-testid="chat-mode-selector"
        tabIndex={-1}
        value={supported ? selectedMode : ""}
        disabled={unavailable || saving}
        onChange={(event) => void choose(event.target.value as ChatMode)}
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
      >
        {!supported && (
          <option value="" disabled>
            Unavailable mode
          </option>
        )}
        {chatModeCatalog.modes.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
