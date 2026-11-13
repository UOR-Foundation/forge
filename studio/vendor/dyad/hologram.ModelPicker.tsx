// dyad-prism (ours, not upstream's; see VENDORED.md): the model picker, replacing upstream's at build time
// through `resolveId` in vite.shell.config.mts. Two models answer here (shell/host.js): GLM 5.3 Flash in the
// cloud (Featherless) and BitNet 2B on this device. The menu is those two, each on two lines: its name over
// a few words on what choosing it means, and at the right, in one column, a tag saying where it runs. Nothing
// else: no provider headers, no submenus, no recent section, no effort levels, no price badges, no trial
// banner, no Pro upsell. Choosing a model is choosing who answers, which is the only
// decision this control makes.
//
// FoundrySpecification.chatModelPickerScopeBoundary: a mounted chat owns its selection;
// Home owns the default used by future chats.
import { ChevronDownIcon, CloudIcon, LaptopIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatMode } from "@/hooks/useChatMode";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useSettings } from "@/hooks/useSettings";
import { createModelSelection } from "@/lib/modelEffort";
import type { LanguageModel } from "@/ipc/types";
import type { LargeLanguageModel } from "@/lib/schemas";
import { cn } from "@/lib/utils";

import { modelSelectionScope } from "./hologram.model-selection.mjs";

const ORDER = ["featherless", "local"];
// Where each provider's model runs, in one word, shown as a quiet pill beside the name.
const WHERE: Record<string, string> = { featherless: "Cloud", local: "Local" };
// What choosing each one means, in a few words, under its name in the menu.
const MEANS: Record<string, string> = { featherless: "Free, through this site", local: "Runs on this device" };
// The tag in the menu: the same pill with its mark, one width, so the tags of every row form a column.
const Tag = ({ provider }: { provider: string }) => {
  const Mark = provider === "local" ? LaptopIcon : CloudIcon;
  return (
    <span className="inline-flex w-[66px] shrink-0 items-center justify-center gap-1 rounded-full border border-border/60 py-0.5 text-[11px] font-normal leading-4 text-muted-foreground">
      <Mark className="size-3 shrink-0" aria-hidden="true" />
      {WHERE[provider]}
    </span>
  );
};
const Pill = ({ where }: { where: string }) => (
  <span className="shrink-0 rounded-full border border-border/50 px-1.5 py-px text-[10px] font-normal leading-4 text-muted-foreground/70">
    {where}
  </span>
);

export function ModelPicker() {
  const { settings, updateSettings } = useSettings();
  const routerState = useRouterState();
  const router = useRouter();
  const scope = modelSelectionScope(
    routerState.location.pathname,
    router.options.basepath,
    routerState.location.search.id,
  );
  const {
    chat,
    setChatSelection,
    isLoading: chatLoading,
    isUpdating,
  } = useChatMode(scope.kind === "chat" ? scope.chatId : null);
  const { data: providers } = useLanguageModelProviders();
  const { data: modelsByProvider, isLoading } = useLanguageModelsByProviders();
  const [open, setOpen] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const selectionInFlight = useRef(false);
  const unavailable =
    scope.kind === "unavailable" || (scope.kind === "chat" && (chatLoading || !chat || isUpdating));

  const listed = (providers ?? [])
    .filter((provider) => ORDER.includes(provider.id))
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const selected: LargeLanguageModel = chat?.modelSelection ??
    settings?.selectedModel ?? { name: "", provider: "local" };
  const modelsOf = (providerId: string) => modelsByProvider?.[providerId] ?? [];
  const isSelected = (providerId: string, model: LanguageModel) =>
    // The product's default is the device, so a selection upstream left as "auto" reads as the device's model.
    (selected.provider === providerId ||
      (selected.provider === "auto" && providerId === "local")) &&
    (selected.name === model.apiName || selected.provider === "auto");

  const options = listed.flatMap((provider) =>
    modelsOf(provider.id).map((model) => ({ provider: provider.id, model })),
  );
  // A selection no longer offered (OpenRouter) answers on the device, so it reads as the device's model.
  const current =
    options.find(({ provider, model }) => isSelected(provider, model)) ??
    options.find(({ provider }) => provider === "local");
  const label = current ? current.model.displayName : selected.name;
  const where = current ? WHERE[current.provider] : "";

  const choose = async (providerId: string, model: LanguageModel) => {
    if (unavailable || selectionInFlight.current) return;
    selectionInFlight.current = true;
    setSelecting(true);
    setSelectionError(null);
    const next: LargeLanguageModel = { name: model.apiName, provider: providerId };
    try {
      if (scope.kind === "chat") {
        await setChatSelection({
          modelSelection: createModelSelection({ model: next, catalogModel: model }),
        });
      } else if (scope.kind === "default") {
        await updateSettings({ selectedModel: next });
      }
      setOpen(false);
    } catch {
      setSelectionError("The model selection could not be saved. Try again.");
      setOpen(true);
    } finally {
      selectionInFlight.current = false;
      setSelecting(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="inline-flex h-8 max-w-[240px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-border/70 bg-background/40 pl-3 pr-2 text-xs font-medium text-foreground/90 shadow-none transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted/60"
        disabled={unavailable || selecting}
        data-testid="model-picker"
        title={where ? `${label}, ${where}` : label}
      >
        <span className="truncate">{label}</span>
        {where && <Pill where={where} />}
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 p-1.5" align="start">
        {selectionError && (
          <div role="alert" className="px-2 py-1.5 text-sm">
            {selectionError}
          </div>
        )}
        {isLoading && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading models</div>
        )}
        {options.map(({ provider, model }) => (
          <DropdownMenuItem
            key={provider + ":" + model.apiName}
            disabled={unavailable || selecting}
            onClick={() => choose(provider, model)}
            aria-current={isSelected(provider, model) ? "true" : undefined}
            className={cn("cursor-pointer gap-3 rounded-lg px-2.5 py-2", isSelected(provider, model) && "bg-accent")}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("truncate text-[13px] leading-5", isSelected(provider, model) ? "font-medium" : "font-normal")}>
                {model.displayName}
              </span>
              <span className="truncate text-[11px] leading-4 text-muted-foreground">{MEANS[provider]}</span>
            </span>
            <Tag provider={provider} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
