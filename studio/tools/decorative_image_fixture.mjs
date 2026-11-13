// Test-only classification: unrelated external requests must still fail privacy/editor gates.
export function isDecorativeImage(address) {
  try {
    const url = new URL(address);
    if (url.username || url.password || url.hash) return false;
    if (url.origin === 'https://uor-foundation.github.io' && url.pathname.startsWith('/template/frame/backdrops/')) return true;
    if (url.origin === 'https://images.unsplash.com') return true;
    if (url.origin !== 'https://prism-unsplash.trinity-03d.workers.dev' || url.pathname !== '/image') return false;
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length || keys.some(key => !['src','w','h','q','fm'].includes(key))) return false;
    const source = new URL(url.searchParams.get('src'));
    if (source.origin !== 'https://images.unsplash.com' || source.username || source.password || source.hash || !source.pathname.startsWith('/photo-')) return false;
    return /^[1-9]\d{0,3}$/.test(url.searchParams.get('w') || '') &&
      (!url.searchParams.has('h') || /^[1-9]\d{0,3}$/.test(url.searchParams.get('h'))) &&
      /^(75|85)$/.test(url.searchParams.get('q') || '') && /^(avif|webp)$/.test(url.searchParams.get('fm') || '');
  } catch { return false; }
}
