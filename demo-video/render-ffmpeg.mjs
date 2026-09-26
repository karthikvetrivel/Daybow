// Renders a composition to MP4 with the system FFmpeg, instead of the FFmpeg that
// Remotion bundles. Use it where the bundled FFmpeg does not start, for example on macOS 13.
//
//   node render-ffmpeg.mjs Demo out/daybow-16x9.mp4
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const [id = "Demo", output = "out/daybow-16x9.mp4"] = process.argv.slice(2);
const frames = `out/frames-${id}`;
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

rmSync(frames, { recursive: true, force: true });
run("npx", ["remotion", "render", "src/index.ts", id, frames, "--sequence", "--image-format=jpeg", "--jpeg-quality=97"]);
// Both compositions run at 60 fps. Remotion numbers the frames from 0.
run("ffmpeg", [
  "-y", "-loglevel", "error", "-framerate", "60", "-i", `${frames}/element-%04d.jpeg`,
  "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", "16",
  "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", output,
]);
console.log(`wrote ${output}`);
