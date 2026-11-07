import fs from "node:fs/promises";
import { build } from "esbuild";
import {
  writeRootConfig,
  writeWorkerConfig,
  getWorkerBundleDir,
} from "@cloudflare/build-output-utils";
import config from "./cloudflare.config.ts";
const root = process.cwd();
const bundle = getWorkerBundleDir(root);
await fs.mkdir(bundle, { recursive: true });
await build({
  entryPoints: ["server/index.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: bundle + "/index.js",
});
await writeRootConfig(root, undefined, { isPreview: false, mode: undefined });
await writeWorkerConfig({
  root,
  config: config.worker,
  manifest: {
    type: "complete",
    mainModule: "index.js",
    modules: { "index.js": { type: "esm" } },
  },
});
console.log("Worker preparado para publicação.");
