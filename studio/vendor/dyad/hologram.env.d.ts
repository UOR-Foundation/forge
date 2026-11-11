// hologram-forge (ours, see VENDORED.md): Vite serves an imported .svg as its URL; Dyad declares no type for it.
declare module "*.svg" {
  const url: string;
  export default url;
}
