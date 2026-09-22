import { lazy, type ComponentType } from 'react';

/**
 * After a new deployment, an open tab (or a cached index.html) still asks for the previous
 * build's file names, which no longer exist. Instead of leaving the page stuck, reload once
 * to pick up the new version. The sessionStorage guard prevents reload loops.
 */
const RELOAD_KEY = 'kd-chunk-reload';

export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 10_000) return false; // already tried very recently
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage blocked — still try one reload */
  }
  window.location.reload();
  return true;
}

export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|MIME type|ChunkLoadError/i.test(msg);
}

export function lazyPage<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (e) {
      // one quick retry covers a flaky network
      try {
        return await load();
      } catch {
        if (isChunkLoadError(e) && reloadForNewVersion()) return new Promise<never>(() => {}); // page is reloading
        throw e;
      }
    }
  });
}

// Vite fires this when a preloaded dependency of a lazy chunk fails to load.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}
