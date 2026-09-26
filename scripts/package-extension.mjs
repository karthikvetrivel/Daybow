// Builds the extension without an embedded Jev key and writes two ZIP files to release/:
//
//   daybow-<version>.zip                    for GitHub Releases. Keeps the manifest "key", so the
//                                           extension id, and with it the OAuth redirect URI, stays fixed.
//   daybow-<version>-chrome-web-store.zip   for the Chrome Web Store, which assigns its own id and
//                                           does not accept a "key" field.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const out = path.join(root, "release");
// A separate build folder: extension/dist is the copy that Chrome loads, maybe with a Jev key in it.
const dist = path.join(out, ".build");

const env = { ...process.env, EXTENSION_OUT: dist };
delete env.EMBED_JEV_KEY;
rmSync(dist, { recursive: true, force: true });
execFileSync(process.execPath, [path.join(root, "scripts", "build-extension.mjs")], { stdio: "inherit", env });

// Refuse to package a build that contains a Jev key from .env.local.
let key = process.env.TYPESAFE_API_KEY ?? "";
try {
  const m = readFileSync(path.join(root, ".env.local"), "utf8").match(/^\s*TYPESAFE_API_KEY\s*=\s*["']?([^"'\n]+)/m);
  if (m) key = m[1].trim();
} catch {
  // no .env.local
}
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));
if (key.length >= 8 && files(dist).some((f) => readFileSync(f).includes(key))) {
  console.error("The build contains your Jev key. Nothing was packaged.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(path.join(dist, "manifest.json"), "utf8"));
mkdirSync(out, { recursive: true });
const zip = (dir, name) => {
  const target = path.join(out, name);
  rmSync(target, { force: true });
  execFileSync("zip", ["-q", "-r", "-X", target, "."], { cwd: dir });
  return target;
};

const release = zip(dist, `daybow-${version}.zip`);

const storeDir = path.join(out, ".store");
rmSync(storeDir, { recursive: true, force: true });
cpSync(dist, storeDir, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(storeDir, "manifest.json"), "utf8"));
delete manifest.key;
writeFileSync(path.join(storeDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const store = zip(storeDir, `daybow-${version}-chrome-web-store.zip`);
rmSync(storeDir, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });

for (const f of [release, store]) if (!existsSync(f)) throw new Error(`missing ${f}`);
console.log(`packaged ${path.relative(root, release)}`);
console.log(`packaged ${path.relative(root, store)}`);
