// hologram-forge (ours, replaces src/components/FeaturedAppShowcase.tsx; see VENDORED.md): the floor of the
// home screen. Four ways to look at it, in one row: Search, Featured, My apps, Bookmarked.
//
// Featured is the same four Prism apps for every visitor (shell/featured-apps.mjs), so the screen is whole
// before anything has been made. My apps is what this browser holds. Bookmarked is what the visitor starred;
// a star is one person's convenience on one device, so it is kept in this browser's own storage, never
// travels, and is forgotten by a browser that keeps nothing. Nothing here reaches the network.
//
// A cover is drawn, not fetched: white light entering the card and leaving it as a spectrum, turned to the
// app's own hue. Each is a few hundred bytes.
//
// This file is given to the build as the source of src/components/FeaturedAppShowcase.tsx, so what it
// imports is resolved from there: two levels up is the vendored renderer's own folder.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search, Star } from "lucide-react";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useOpenApp } from "@/hooks/useOpenApp";
import { useAppThumbnails } from "@/hooks/useAppThumbnails";
import { sortAppsForShowcase } from "@/lib/sortApps";
import { featuredApps, featuredOnHome } from "../../hologram.featured-apps.mjs";

type Featured = { id: string; by: string; name: string; sentence: string; tag: string; idea: string; hue: number; url: string };
type View = "featured" | "mine" | "saved";

const BOOKMARKS = "foundry:bookmarks";

function readBookmarks(): string[] {
  try {
    const kept = JSON.parse(window.localStorage.getItem(BOOKMARKS) ?? "[]");
    return Array.isArray(kept) ? kept.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function useBookmarks() {
  const [kept, setKept] = useState<string[]>([]);
  useEffect(() => setKept(readBookmarks()), []);
  const toggle = useCallback((key: string) => {
    setKept((was) => {
      const next = was.includes(key) ? was.filter((one) => one !== key) : [...was, key];
      try {
        window.localStorage.setItem(BOOKMARKS, JSON.stringify(next));
      } catch {
        return was;
      }
      return next;
    });
  }, []);
  return { kept, toggle };
}

function Cover({ hue }: { hue: number }) {
  const band = (index: number) => `hsl(${(hue + index * 26) % 360} 86% 64%)`;
  return (
    <svg viewBox="0 0 288 144" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id={`g-${hue}-ground`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 34% 13%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 40) % 360} 28% 7%)`} />
        </linearGradient>
        <linearGradient id={`g-${hue}-beam`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <rect width="288" height="144" fill={`url(#g-${hue}-ground)`} />
      <polygon points="0,58 96,66 96,78 0,86" fill={`url(#g-${hue}-beam)`} />
      {[0, 1, 2, 3, 4].map((index) => (
        <polygon key={index} points={`96,70 288,${18 + index * 26} 288,${40 + index * 26}`} fill={band(index)} opacity={0.42 - index * 0.045} />
      ))}
      <polygon points="88,52 112,72 88,92" fill="#ffffff" opacity="0.1" />
    </svg>
  );
}

function Keep({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      data-slot="home-featured-keep"
      data-chosen={on ? "" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Star className="h-3.5 w-3.5" fill={on ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

function Card({
  title,
  under,
  cover,
  badge,
  keep,
  onOpen,
}: {
  title: string;
  under: string;
  cover: ReactNode;
  badge: string | null;
  keep: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="min-w-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        title={title}
        data-testid={`app-showcase-card-${title}`}
        className="group flex w-full min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl border border-border bg-muted transition-colors duration-200 group-hover:border-foreground/20">
          {cover}
          {badge && (
            <span className="absolute bottom-2.5 left-2.5 rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-medium leading-5 text-foreground">
              {badge}
            </span>
          )}
          {keep}
        </div>
        <div className="flex min-w-0 flex-col px-0.5">
          <span className="truncate text-[15px] font-medium leading-snug text-foreground">{title}</span>
          <span className="truncate text-[13px] leading-5 text-muted-foreground">{under}</span>
        </div>
      </div>
    </div>
  );
}

export function FeaturedAppShowcase() {
  const navigate = useNavigate();
  const openApp = useOpenApp();
  const { apps } = useLoadApps();
  const { kept, toggle } = useBookmarks();
  const [view, setView] = useState<View>("featured");
  const [asking, setAsking] = useState(false);
  const [query, setQuery] = useState("");

  const featured = useMemo(() => (featuredApps as Featured[]).slice(0, featuredOnHome), []);
  const mine = useMemo(() => sortAppsForShowcase(apps).slice(0, featuredOnHome), [apps]);
  const thumbnails = useAppThumbnails(useMemo(() => mine.map((app) => app.id), [mine]));

  const asked = query.trim().toLowerCase();
  const matches = (text: string) => !asked || text.toLowerCase().includes(asked);
  const shownFeatured = featured.filter(
    (app) => (view === "saved" ? kept.includes("featured:" + app.id) : view === "featured") && matches(app.name),
  );
  const shownMine = mine.filter(
    (app) => (view === "saved" ? kept.includes("app:" + app.id) : view === "mine") && matches(app.name),
  );
  const nothing = shownFeatured.length === 0 && shownMine.length === 0;

  const take = (app: Featured) => {
    if (app.url) window.open(app.url, "_blank", "noopener,noreferrer");
    else window.dispatchEvent(new CustomEvent("foundry:idea", { detail: app.idea }));
  };

  const pill = (id: View, label: string) => (
    <button key={id} type="button" data-chosen={view === id ? "" : undefined} onClick={() => setView(id)}>
      {label}
    </button>
  );

  return (
    <section data-testid="featured-app-showcase" className="w-full max-w-6xl mx-auto px-8 mt-8 mb-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div data-slot="home-featured-views" className="flex min-w-0 items-center">
          <button
            type="button"
            data-slot="home-featured-search"
            aria-label="Search apps"
            aria-expanded={asking}
            data-chosen={asking ? "" : undefined}
            onClick={() => {
              if (asking) setQuery("");
              setAsking((was) => !was);
            }}
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            {!asking && <span>Search</span>}
          </button>
          {asking && (
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  setAsking(false);
                }
              }}
              placeholder="Find an app"
              aria-label="Find an app"
              data-slot="home-featured-query"
            />
          )}
          {pill("featured", "Featured")}
          {pill("mine", "My apps")}
          {pill("saved", "Bookmarked")}
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/apps" })}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Browse all
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <div
          tabIndex={0}
          role="region"
          aria-label="App showcase"
          className="flex gap-4 overflow-x-auto scrollbar-on-hover pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
        >
          {shownFeatured.map((app) => (
            <Card
              key={app.id}
              title={app.name}
              under={app.by}
              badge={app.url ? "Published" : "Coming soon"}
              cover={<Cover hue={app.hue} />}
              keep={<Keep on={kept.includes("featured:" + app.id)} label={`Bookmark ${app.name}`} onClick={() => toggle("featured:" + app.id)} />}
              onOpen={() => take(app)}
            />
          ))}
          {shownMine.map((app) => {
            const picture = thumbnails.get(app.id) ?? null;
            return (
              <Card
                key={app.id}
                title={app.name}
                under="Yours"
                badge={null}
                cover={
                  picture ? (
                    <img src={picture} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
                  ) : (
                    <Cover hue={(app.id * 47) % 360} />
                  )
                }
                keep={<Keep on={kept.includes("app:" + app.id)} label={`Bookmark ${app.name}`} onClick={() => toggle("app:" + app.id)} />}
                onOpen={() => openApp(app.id)}
              />
            );
          })}
          {nothing && (
            <p data-slot="home-featured-empty" className="py-6 text-sm text-muted-foreground">
              {view === "saved"
                ? "Nothing bookmarked yet. The star on a card keeps it here."
                : view === "mine"
                  ? "No apps yet. Describe one in the box above."
                  : "Nothing matches that."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
