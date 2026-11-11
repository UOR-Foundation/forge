// The appearance switch on the renderer's UI: Immersive, Dark, Light, the same canonical state and hooks
// Hologram OS keeps (holo.theme.v1 on <html>: data-holo-palette, data-holo-immersive, --holo-wallpaper),
// mirrored into the renderer's own theme (the dark or light class on <html>, and its localStorage "theme"),
// and followed the other way when the renderer's settings page switches its theme. Adapters only.
//
// The panel is the Prism frame's theme panel (UOR-Foundation/template frame/panels.mjs): the three looks as
// one segmented control, Unsplash search, nine photos (the visitor's recent picks, then the frame's nine
// built-in ones) and the photographer's credit. The built-in photos are the frame's own files on its host;
// search and every found photo go through the frame's Unsplash worker (frame/unsplash), which holds the one
// Unsplash key every Prism app and every visitor shares, so no page carries a key. The markup is built here,
// into the popover the projected page already has, so the page itself is unchanged.
const KEY = "holo.theme.v1";
const $ = (id) => document.getElementById(id);
const WALLS = JSON.parse($("wallpapers").textContent);
const root = document.documentElement;

const FRAME_HOST = "https://uor-foundation.github.io/template/frame/";
const PROXY = "https://prism-unsplash.trinity-03d.workers.dev/";
const UTM = "utm_source=prism&utm_medium=referral";
// The frame's nine built-in photos (frame/panels.mjs BACKDROPS), in its order. Their placeholder colours are
// left out: no colour is typed in the shell (the Brand gate); a found photo brings its own from Unsplash.
const BUILT_IN = [
  {"id":"E0AHdsENmDg","image":"https://images.unsplash.com/photo-1464802686167-b939a6910659?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHwxfHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0","alt":"The Milky Way in blue and violet","name":"Jeremy Thomas","user":"jeremythomasphoto"},
  {"id":"qtRF_RxCAo0","image":"https://images.unsplash.com/photo-1610296669228-602fa827fc1f?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw0fHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0","alt":"A nebula in blue, gold and rust","name":"Aldebaran S","user":"aldebarans"},
  {"id":"RF4p4rTM-2s","image":"https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw1fHxtaWxreSUyMHdheXxlbnwxfDB8fHwxNzk0MDU2MjUxfDA&ixlib=rb-4.1.0","alt":"The Andromeda galaxy among stars","name":"Bryan Goff","user":"bryangoffphoto"},
  {"id":"Q1p7bh3SHj8","image":"https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw1fHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0","alt":"City lights across Earth at night, from orbit","name":"NASA","user":"nasa"},
  {"id":"t7EL2iG3jMc","image":"https://images.unsplash.com/photo-1534996858221-380b92700493?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw5fHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0","alt":"Earth's blue horizon against space","name":"ActionVance","user":"actionvance"},
  {"id":"9wH624ALFQA","image":"https://images.unsplash.com/photo-1515705576963-95cad62945b6?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHwxfHxtaWxreSUyMHdheXxlbnwxfDB8fHwxNzk0MDU2MjUxfDA&ixlib=rb-4.1.0","alt":"The Milky Way rising over mountains","name":"Dns Dgn","user":"dnsdgn"},
  {"id":"oMcTmNHclZI","image":"https://images.unsplash.com/photo-1628818144466-856f7d477125?ixid=M3w4OTc5NTl8MHwxfGFsbHx8fHx8fHx8fDE3OTQwNTIyMTV8&ixlib=rb-4.1.0","alt":"Green and violet aurora over a starry sky","name":"Condor Wei","user":"cwcanchn"},
  {"id":"cZgVpseeazg","image":"https://images.unsplash.com/photo-1545431766-45ff67845191?ixid=M3w4OTc5NTl8MHwxfGFsbHx8fHx8fHx8fDE3OTQwNTIyMTB8&ixlib=rb-4.1.0","alt":"A soft blur of rainbow light","name":"Sean Sinclair","user":"seanwsinclair"},
  {"id":"0wFwSZn6I-I","image":"https://images.unsplash.com/photo-1709625862266-014ef072fd93?ixid=M3w4OTc5NTl8MHwxfGFsbHx8fHx8fHx8fDE3OTQwNTIyMTJ8&ixlib=rb-4.1.0","alt":"Dark curved forms in soft light","name":"Pawel Czerwinski","user":"pawel_czerwinski"},
];
const isBuiltIn = (photo) => BUILT_IN.some((p) => p.id === photo.id);
const fullOf = (photo) => (isBuiltIn(photo) ? `${FRAME_HOST}backdrops/${photo.id}.jpg` : `${PROXY}image?${new URLSearchParams({ src: photo.image, w: "2400" })}`);
const thumbOf = (photo) => (isBuiltIn(photo) ? `${FRAME_HOST}backdrops/${photo.id}-thumb.jpg` : `${PROXY}image?${new URLSearchParams({ src: photo.image, w: "240", h: "150" })}`);

// The build screen (the renderer's chat route: chat beside the live preview) keeps its own look, Dark until
// one is chosen there, kept under BUILD_KEY; every other screen keeps the home look under KEY. The photo,
// wallpaper and recent picks are one set, shared by both. The pre paint script in index.html reads the same.
const BUILD_KEY = "holo.theme.build.v1";
const onBuild = () => /\/chat\/?$/.test(location.pathname);
function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
function readTheme() {
  const home = readJson(KEY) || {};
  if (!onBuild()) return home;
  const b = readJson(BUILD_KEY) || { palette: "dark", immersive: false };
  return { ...home, palette: b.palette === "light" ? "light" : "dark", immersive: !!b.immersive };
}
// A choice: kept for the screen it was made on, then shown.
function applyTheme(s) {
  try {
    if (onBuild()) {
      localStorage.setItem(KEY, JSON.stringify({ ...(readJson(KEY) || {}), look: 3, wallpaper: s.wallpaper, photo: s.photo, recent: s.recent }));
      localStorage.setItem(BUILD_KEY, JSON.stringify({ palette: s.palette === "light" ? "light" : "dark", immersive: !!s.immersive }));
    } else localStorage.setItem(KEY, JSON.stringify({ look: 3, ...s }));
  } catch (e) {}
  showTheme(s);
}
function showTheme(s) {
  const palette = s.palette === "light" ? "light" : "dark";
  root.setAttribute("data-holo-palette", palette);
  root.setAttribute("data-holo-immersive", s.immersive ? "on" : "off");
  root.style.setProperty("color-scheme", palette);
  if (s.wallpaper) root.style.setProperty("--holo-wallpaper", `url(${JSON.stringify(s.wallpaper)})`);
  // the renderer's theme follows the palette: its provider reads the class it set and its stored choice.
  if (!root.classList.contains(palette)) { root.classList.remove("light", "dark"); root.classList.add(palette); }
  try { localStorage.setItem("theme", palette); } catch (e) {}
  paint(s);
}

// ---- the panel
const icon = (mode) => { const b = document.querySelector(`#popover .mode[data-mode="${mode}"] svg`); return b ? b.outerHTML : ""; };
const LENS = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"></circle><path d="m10.5 10.5 3 3"></path></svg>';
const icons = { immersive: icon("immersive"), dark: icon("dark"), light: icon("light") };
$("popover").innerHTML = `
  <div class="theme-head">Theme</div>
  <div class="seg" role="radiogroup" aria-label="Look">
    <button class="mode" type="button" data-mode="immersive" role="radio">${icons.immersive}<span>Immersive</span></button>
    <button class="mode" type="button" data-mode="dark" role="radio">${icons.dark}<span>Dark</span></button>
    <button class="mode" type="button" data-mode="light" role="radio">${icons.light}<span>Light</span></button>
  </div>
  <div class="photos-part" id="photos-part">
    <label class="find">${LENS}<input id="find" type="search" placeholder="Search Unsplash" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Search Unsplash" /></label>
    <div class="photos" id="photos" role="listbox" aria-label="Photos"></div>
    <p class="credit" id="credit">Photo by <a id="credit-name" target="_blank" rel="noopener"></a> on <a href="https://unsplash.com/?${UTM}" target="_blank" rel="noopener">Unsplash</a></p>
  </div>`;

let shown = [];
function grid(photos) {
  shown = photos.slice(0, 9);
  const s = readTheme();
  $("photos").innerHTML = "";
  for (const photo of shown) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "photo"; b.title = photo.alt || photo.name; b.setAttribute("aria-label", photo.alt || photo.name);
    b.style.backgroundColor = photo.color || "";
    b.style.backgroundImage = `url(${JSON.stringify(thumbOf(photo))})`;
    b.setAttribute("aria-pressed", String(!!s.immersive && s.photo && s.photo.id === photo.id));
    b.onclick = () => choose(photo);
    $("photos").append(b);
  }
}
function defaults() {
  const recent = readTheme().recent || [];
  return [...recent, ...BUILT_IN.filter((p) => !recent.some((r) => r.id === p.id))];
}
function choose(photo) {
  const s = readTheme();
  // A found photo counts as used once set, as Unsplash asks; the built-in ones are the frame's files.
  if (!isBuiltIn(photo)) {
    fetch(`${PROXY}use?id=${encodeURIComponent(photo.id)}`, { method: "POST" }).catch(() => {});
  }
  const recent = isBuiltIn(photo) ? s.recent || [] : [photo, ...(s.recent || []).filter((p) => p.id !== photo.id)].slice(0, 3);
  applyTheme({ ...s, palette: "dark", immersive: true, wallpaper: fullOf(photo), photo, recent });
}
function paint(s) {
  const mode = s.immersive ? "immersive" : s.palette === "light" ? "light" : "dark";
  for (const b of document.querySelectorAll("#popover .mode")) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
  $("photos-part").hidden = mode !== "immersive";
  for (const [i, b] of [...document.querySelectorAll("#photos .photo")].entries()) b.setAttribute("aria-pressed", String(!!s.immersive && !!s.photo && shown[i] && s.photo.id === shown[i].id));
  // The credit: the chosen photo's photographer, or the shell's own wallpaper's.
  const photo = s.photo;
  const wall = WALLS.find((w) => w.file === s.wallpaper);
  // A wallpaper credited only to Unsplash names no photographer, so it gets no line.
  const name = photo ? photo.name : wall && wall.by !== "Unsplash" ? wall.by : "";
  const href = photo ? `https://unsplash.com/@${photo.user}?${UTM}` : wall ? wall.byUrl : "";
  $("credit").hidden = !name;
  $("credit-name").textContent = name;
  $("credit-name").href = href || `https://unsplash.com/?${UTM}`;
}
function setMode(mode) {
  const s = readTheme();
  if (mode === "immersive") applyTheme({ ...s, palette: "dark", immersive: true, wallpaper: s.wallpaper || WALLS[0].file });
  else applyTheme({ ...s, palette: mode, immersive: false, wallpaper: s.wallpaper || WALLS[0].file });
}

// Search: nine landscape photos for the words, through the worker; no words, the default nine.
let searching = null, typing = null;
async function search(words) {
  if (searching) searching.abort();
  if (!words.trim()) { grid(defaults()); return; }
  const control = (searching = new AbortController());
  try {
    const r = await fetch(`${PROXY}search?${new URLSearchParams({ q: words.trim(), page: "1" })}`, { signal: control.signal });
    if (!r.ok) throw new Error(String(r.status));
    const found = await r.json();
    if (searching === control) grid(found.photos || []);
  } catch (e) {
    if (e.name !== "AbortError" && searching === control) $("photos").innerHTML = '<p class="none">Search is unavailable right now.</p>';
  }
}
$("find").addEventListener("input", (e) => { clearTimeout(typing); typing = setTimeout(() => search(e.target.value), 350); });
$("find").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { clearTimeout(typing); search(e.target.value); }
  // The first Escape clears the search; the next closes the panel.
  if (e.key === "Escape") { if (e.target.value) { e.target.value = ""; search(""); e.stopPropagation(); } else close(); }
});

const close = () => { $("popover").hidden = true; $("appearance").setAttribute("aria-expanded", "false"); };
$("appearance").onclick = (e) => {
  e.stopPropagation();
  const open = $("popover").hidden;
  $("popover").hidden = !open;
  $("appearance").setAttribute("aria-expanded", String(open));
  if (open && !$("photos").children.length) grid(defaults());
};
document.addEventListener("click", (e) => { if (!$("popover").contains(e.target)) close(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("popover").hidden) close(); });
for (const b of document.querySelectorAll("#popover .mode")) b.onclick = () => setMode(b.dataset.mode);
showTheme(readTheme());

// The renderer moves between screens without loading a page (pushState, replaceState, back and forward), so
// the look follows the route: entering or leaving the build screen shows that screen's look.
let wasBuild = onBuild();
function routed() {
  if (onBuild() === wasBuild) return;
  wasBuild = onBuild();
  showTheme(readTheme());
}
for (const name of ["pushState", "replaceState"]) {
  const move = history[name];
  history[name] = function (...args) { const r = move.apply(this, args); routed(); return r; };
}
addEventListener("popstate", routed);

// When the renderer's own settings switch its theme class, the palette follows (and Immersive, which is a
// dark look, steps aside for Light).
new MutationObserver(() => {
  const s = readTheme();
  const rtheme = root.classList.contains("light") ? "light" : root.classList.contains("dark") ? "dark" : null;
  if (!rtheme || rtheme === (s.palette === "light" ? "light" : "dark")) return;
  applyTheme({ ...s, palette: rtheme, immersive: rtheme === "light" ? false : s.immersive });
}).observe(root, { attributes: true, attributeFilter: ["class"] });
