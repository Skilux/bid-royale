import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Lets plain `node --test` load app/lib/masumi, which uses the Next-only `@/` alias and
 * extensionless relative imports. Tests and the fixture script import this first. It never
 * changes resolution for specifiers that already resolve.
 */
export function installNextResolution() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) {
        const base = resolvePath(APP_ROOT, specifier.slice(2));
        const file = [base, `${base}.js`, `${base}/index.js`].find((p) => /\.js$/.test(p) && existsSync(p));
        if (file) return nextResolve(pathToFileURL(file).href, context);
      }
      try {
        return nextResolve(specifier, context);
      } catch (err) {
        if (specifier.startsWith(".") && context.parentURL && !/\.[a-z]+$/.test(specifier)) {
          return nextResolve(`${specifier}.js`, context);
        }
        throw err;
      }
    },
  });
}
