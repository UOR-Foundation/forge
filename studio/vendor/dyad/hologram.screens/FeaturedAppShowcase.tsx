// hologram-forge (ours, replaces src/components/FeaturedAppShowcase.tsx; see VENDORED.md): the floor of the
// home screen. It shows the same six Prism apps to every visitor (shell/featured-apps.mjs), so the screen
// is whole before a visitor has made anything, and the gallery is one click away beside them.
//
// A cover is drawn here, not fetched: white light entering the card and leaving it as a spectrum, turned to
// the app's own hue. Nothing on this screen reaches the network, and each cover is a few hundred bytes.
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
// This file is given to the build as the source of src/components/FeaturedAppShowcase.tsx, so what it
// imports is resolved from there: two levels up is the vendored renderer's own folder.
import { featuredApps } from "../../hologram.featured-apps.mjs";

type Featured = { id: string; name: string; sentence: string; tag: string; idea: string; hue: number; url: string };

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
        <polygon
          key={index}
          points={`96,70 288,${18 + index * 26} 288,${40 + index * 26}`}
          fill={band(index)}
          opacity={0.42 - index * 0.045}
        />
      ))}
      <polygon points="88,52 112,72 88,92" fill="#ffffff" opacity="0.1" />
    </svg>
  );
}

export function FeaturedAppShowcase() {
  const navigate = useNavigate();
  const apps = featuredApps as Featured[];

  // Until a featured app has a link, its card writes its idea into the box on this same screen.
  const open = (app: Featured) => {
    if (app.url) window.open(app.url, "_blank", "noopener,noreferrer");
    else window.dispatchEvent(new CustomEvent("foundry:idea", { detail: app.idea }));
  };

  return (
    <section data-testid="featured-app-showcase" className="w-full max-w-6xl mx-auto px-8 mt-8 mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Featured apps</h2>
        <button
          type="button"
          onClick={() => navigate({ to: "/templates" })}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Explore the app gallery
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
          {apps.map((app) => (
            <div key={app.id} className="w-72 flex-shrink-0">
              <button
                type="button"
                onClick={() => open(app)}
                title={app.name}
                data-testid={`app-showcase-card-${app.name}`}
                className="group flex w-full min-w-0 flex-col gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
              >
                <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl border border-border bg-muted transition-colors duration-200 group-hover:border-foreground/20">
                  <Cover hue={app.hue} />
                </div>
                <div className="flex min-w-0 flex-col gap-2 px-0.5">
                  <p className="truncate text-[15px] font-medium leading-snug text-foreground">{app.name}</p>
                  <p className="line-clamp-2 h-[3em] text-sm leading-[1.5] text-muted-foreground [text-wrap:pretty]">
                    {app.sentence}
                  </p>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
