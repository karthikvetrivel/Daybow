// Renders chosen frames of a composition to PNG, bundling once.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [, , id = "Demo", ...frames] = process.argv;
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id, inputProps: {} });
for (const f of frames.map(Number)) {
  const output = path.resolve(`out/stills/${id}-${String(f).padStart(4, "0")}.png`);
  await renderStill({ serveUrl, composition, frame: f, output, inputProps: composition.defaultProps });
  console.log("rendered", output);
}
