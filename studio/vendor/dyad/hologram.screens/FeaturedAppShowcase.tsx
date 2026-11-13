// hologram-forge (ours, replaces src/components/FeaturedAppShowcase.tsx; see VENDORED.md): the floor of the
// home screen. It holds the apps already made, newest first, as 2:1 cover cards. Before the first app is
// made there is nothing to hold, and an empty floor reads as a missing one, so it then holds what a person
// can start from: the gallery's own templates, with the way into the gallery beside them. A template's
// picture is hosted elsewhere, and this screen sends nothing anywhere, so a template card keeps the card's
// shape with its initial on a quiet ground.
import { useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useOpenApp } from "@/hooks/useOpenApp";
import { AppShowcaseCard } from "@/components/AppShowcaseCard";
import { useAppThumbnails } from "@/hooks/useAppThumbnails";
import { useTemplates } from "@/hooks/useTemplates";
import { sortAppsForShowcase } from "@/lib/sortApps";

const MAX_FEATURED_APPS = 10;

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const codePoint = trimmed.codePointAt(0);
  return codePoint ? String.fromCodePoint(codePoint).toUpperCase() : trimmed[0].toUpperCase();
}

function Floor({ title, action, onAction, children }: { title: string; action: string; onAction: () => void; children: ReactNode }) {
  return (
    <section data-testid="featured-app-showcase" className="w-full max-w-6xl mx-auto px-8 mt-8 mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {action}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <div
          tabIndex={0}
          role="region"
          aria-label="App showcase"
          className="flex gap-4 overflow-x-auto scrollbar-on-hover pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

export function FeaturedAppShowcase() {
  const { apps } = useLoadApps();
  const { templates } = useTemplates();
  const openApp = useOpenApp();
  const navigate = useNavigate();

  const sortedApps = useMemo(() => sortAppsForShowcase(apps), [apps]);
  const featured = useMemo(() => sortedApps.slice(0, MAX_FEATURED_APPS), [sortedApps]);
  const featuredIds = useMemo(() => featured.map((a) => a.id), [featured]);
  const thumbnailByAppId = useAppThumbnails(featuredIds);
  const starters = useMemo(
    () => (templates ?? []).filter((template) => template.isOfficial).slice(0, MAX_FEATURED_APPS),
    [templates],
  );

  const gallery = () => navigate({ to: "/templates" });

  if (sortedApps.length === 0) {
    if (starters.length === 0) return null;
    return (
      <Floor title="Start from a template" action="Explore the app gallery" onAction={gallery}>
        {starters.map((template) => (
          <div key={template.id} className="w-72 flex-shrink-0">
            <button
              type="button"
              onClick={gallery}
              title={template.title}
              data-testid={`app-showcase-card-${template.title}`}
              className="group flex w-full min-w-0 flex-col gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl border border-border bg-muted transition-colors duration-200 group-hover:border-foreground/20">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display text-3xl font-medium text-muted-foreground">{initialOf(template.title)}</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2 px-0.5">
                <p className="truncate text-[15px] font-medium leading-snug text-foreground">{template.title}</p>
                <p className="line-clamp-2 h-[3em] text-sm leading-[1.5] text-muted-foreground [text-wrap:pretty]">
                  {template.description}
                </p>
              </div>
            </button>
          </div>
        ))}
      </Floor>
    );
  }

  const hasMore = sortedApps.length > MAX_FEATURED_APPS;
  return (
    <Floor title="Featured Apps" action="See more" onAction={() => navigate({ to: "/apps" })}>
      {featured.map((app) => (
        <div key={app.id} className="w-72 flex-shrink-0">
          <AppShowcaseCard app={app} thumbnailUrl={thumbnailByAppId.get(app.id) ?? null} onClick={openApp} />
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => navigate({ to: "/apps" })}
          className="flex flex-col items-center justify-center w-72 aspect-[2/1] flex-shrink-0 rounded-xl border border-dashed border-border bg-(--background-lighter) hover:border-primary/40 hover:bg-(--background-lightest) transition-all duration-200 active:scale-[0.99]"
        >
          <ChevronRight className="w-6 h-6 text-muted-foreground mb-1" />
          <span className="text-sm font-medium">See more</span>
        </button>
      )}
    </Floor>
  );
}
