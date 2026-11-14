import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Copy the single-threaded Stockfish 16 WASM build into the static public
 * folder. The single-thread build does not need Cross-Origin Isolation
 * headers, so it works on GitHub Pages. We skip the 39MB NNUE net and
 * run with classical eval (`Use NNUE` is turned off in the engine wrapper).
 */
const require = createRequire(import.meta.url);
const destDir = path.resolve("client/public/engine");

try {
  const pkgDir = path.dirname(require.resolve("stockfish/package.json"));
  const srcDir = path.join(pkgDir, "src");
  fs.mkdirSync(destDir, { recursive: true });
  const files = [
    ["stockfish-nnue-16-single.js", "stockfish.js"],
    ["stockfish-nnue-16-single.wasm", "stockfish.wasm"],
  ];
  for (const [from, to] of files) {
    const src = path.join(srcDir, from);
    if (!fs.existsSync(src)) throw new Error(`Missing ${src}`);
    fs.copyFileSync(src, path.join(destDir, to));
  }
  // Rewrite the default wasm filename the JS glue looks for.
  const jsPath = path.join(destDir, "stockfish.js");
  let js = fs.readFileSync(jsPath, "utf8");
  js = js.replaceAll("stockfish-nnue-16-single.wasm", "stockfish.wasm");
  fs.writeFileSync(jsPath, js);
  console.log("Copied Stockfish single-thread WASM to client/public/engine/");
} catch (err) {
  if (process.env.npm_command === "publish") throw err;
  console.warn("copy-stockfish:", err.message);
}
