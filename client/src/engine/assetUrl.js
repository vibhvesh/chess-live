/**
 * Resolve a static asset (Stockfish worker / wasm) to an absolute URL.
 *
 * Vite sets import.meta.env.BASE_URL to the app subpath (e.g. "/chess-live/"
 * on GitHub Pages). `new URL(file, BASE_URL)` throws
 * "Failed to construct 'URL': Invalid base URL" because a bare path is not
 * a valid URL base. Hash routes (e.g. .../chess-live/#/c/id) and a missing
 * trailing slash also break resolution if you only use document.baseURI.
 *
 * Always build: origin + BASE_URL + relative file.
 */
export function resolveAssetUrl(relPath, { origin, basePath, baseURI } = {}) {
  const rel = String(relPath || "").replace(/^\//, "");
  const envBase = basePath == null || basePath === "" ? "/" : String(basePath);

  let root;
  if (/^https?:\/\//i.test(envBase)) {
    root = envBase;
  } else if (origin) {
    const path = envBase.startsWith("/") ? envBase : `/${envBase}`;
    root = String(origin).replace(/\/$/, "") + path;
  } else if (baseURI) {
    try {
      const fromDoc = new URL(baseURI);
      const path = envBase.startsWith("/") ? envBase : `/${envBase}`;
      root = fromDoc.origin + path;
    } catch {
      throw new Error(`Invalid base URL: ${baseURI}`);
    }
  } else {
    throw new Error(`Invalid base URL: ${envBase}`);
  }

  if (!root.endsWith("/")) root += "/";
  return new URL(rel, root).href;
}

function runtimeOrigin() {
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    return location.origin;
  }
  if (typeof document !== "undefined" && document.baseURI) {
    try {
      return new URL(document.baseURI).origin;
    } catch {
      return "";
    }
  }
  return "";
}

function runtimeBasePath() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) {
      return import.meta.env.BASE_URL;
    }
  } catch {
    /* not bundled */
  }
  return "/";
}

export function assetUrl(relPath) {
  return resolveAssetUrl(relPath, {
    origin: runtimeOrigin(),
    basePath: runtimeBasePath(),
    baseURI: typeof document !== "undefined" ? document.baseURI : undefined,
  });
}

/**
 * Stockfish.js (worker build) reads the wasm path from location.hash:
 *   stockfish.js#<encoded wasm url>
 */
export function engineWorkerUrl() {
  const script = assetUrl("engine/stockfish.js");
  const wasm = assetUrl("engine/stockfish.wasm");
  const hashFree = script.split("#")[0];
  return `${hashFree}#${encodeURIComponent(wasm)}`;
}
