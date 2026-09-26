// Bundles the Chrome extension into extension/dist (the folder to load unpacked).
//
// The first build creates extension/key.pem, a private signing key that fixes
// the extension's id on your machine. The id decides the OAuth redirect URI,
// which is printed at the end: register it on your Google OAuth client.
//
// Configuration comes from .env.local or the environment:
//   GOOGLE_CLIENT_ID      required: your OAuth client id (Web application type)
//   EMBED_JEV_KEY=1       optional: embed TYPESAFE_API_KEY as the default Jev key.
//                         Never share a build made this way.
import { build } from "esbuild";
import { createHash, createPublicKey, generateKeyPairSync } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const ext = path.join(root, "extension");
const dist = path.join(ext, "dist");
mkdirSync(dist, { recursive: true });

const env = {};
try {
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // no .env.local: rely on the environment
}
const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || "";
const jevKey = process.env.EMBED_JEV_KEY ? process.env.TYPESAFE_API_KEY || env.TYPESAFE_API_KEY || "" : "";
if (!clientId) {
  console.error("GOOGLE_CLIENT_ID is missing. Put it in .env.local (see README, \"Set up Google sign-in\").");
  process.exit(1);
}

// A per-developer key, created once and never committed.
const keyPath = path.join(ext, "key.pem");
if (!existsSync(keyPath)) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log("created extension/key.pem (keep it private; it fixes your extension id)");
}
const publicDer = createPublicKey(readFileSync(keyPath)).export({ type: "spki", format: "der" });
const publicB64 = Buffer.from(publicDer).toString("base64");
const extensionId = [...createHash("sha256").update(publicDer).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");

const common = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  outdir: dist,
  sourcemap: false,
  minify: false,
  define: {
    __GOOGLE_CLIENT_ID__: JSON.stringify(clientId),
    __TYPESAFE_API_KEY__: JSON.stringify(jevKey),
  },
};
// The service worker is a module; the content script and the options page are classic scripts.
await build({ ...common, format: "esm", entryPoints: { background: path.join(ext, "src/background.ts") } });
await build({ ...common, format: "iife", entryPoints: { content: path.join(ext, "src/content.ts"), options: path.join(ext, "src/options.ts") } });

const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = readFileSync(path.join(ext, "manifest.template.json"), "utf8")
  .replace("__PUBLIC_KEY__", publicB64)
  .replace("__VERSION__", version);
writeFileSync(path.join(dist, "manifest.json"), manifest);
for (const f of ["options.html", "options.css"]) copyFileSync(path.join(ext, "static", f), path.join(dist, f));
copyFileSync(path.join(root, "ui", "category-calendar.css"), path.join(dist, "calendar.css"));
mkdirSync(path.join(dist, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) copyFileSync(path.join(ext, "static", "icons", `icon-${size}.png`), path.join(dist, "icons", `icon-${size}.png`));

console.log(`built extension/dist (version ${version})`);
console.log(`  extension id   ${extensionId}`);
console.log(`  redirect URI   https://${extensionId}.chromiumapp.org/   (add it to your Google OAuth client)`);
console.log(`  Jev key        ${jevKey ? "embedded as the default (do not share this build)" : "not embedded (paste it in the options page)"}`);
