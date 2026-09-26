# Demo video

A 23.4-second product video for Daybow, made in code with [Remotion](https://www.remotion.dev/). The video uses no screen recording, and all its events are fictional.

## Output

| File | Format | Use |
|---|---|---|
| `out/daybow-16x9.mp4` | 1920 × 1080, 60 fps, H.264 | X, YouTube, the README |
| `out/daybow-1x1.mp4` | 1080 × 1080, 60 fps, H.264 | X on phones, LinkedIn |

The render creates the `out/` folder. Git ignores it.

## What it shows

1. Title card: "Your calendar, color-coded by itself."
2. A week in which every event has the calendar's one default color.
3. The first pass: every event takes its category color in a wave, as in the extension's staggered repaint.
4. The user creates "Dinner with Sam". Jev predicts Social while the title is typed, and the chip appears already colored while Google still shows "Saving…".
5. On the configuration page, the user clicks a Social event in the categories week and picks Bubblegum from the pastel palette. The color saves at once, and every Social event on the open calendar turns pink in place.
6. End card.

Each beat matches real behavior. The extension predicts from the typed title and paints the chip in the frame where it appears. Google takes about two seconds to save. A color pick saves at once, and the open calendar repaints in place.

## Render

You need Node.js 22 or later.

```
cd demo-video
npm install
npm run studio          # live preview with a timeline scrubber
npm run render          # out/daybow-16x9.mp4
npm run render:square   # out/daybow-1x1.mp4
```

If the render stops with `Symbol not found` or `built for macOS 15`, the FFmpeg that Remotion bundles cannot run on your system. This occurs on macOS 13. Install FFmpeg, then use the scripts that render frames and encode them with your FFmpeg:

```
brew install ffmpeg
npm run render:ffmpeg
npm run render:square:ffmpeg
```

To update `docs/demo.gif`, `docs/hero.png`, and `docs/social-preview.png` from the 16:9 video, run `npm run readme-media`.

## Edit

| To change | Edit |
|---|---|
| Timing of any beat | `src/timeline.ts` |
| Captions, title, end card text | `src/Demo.tsx` (captions list, `Intro`, `Outro`) |
| Events in the week, categories, colors | `src/data.ts` |
| Camera moves | The `keyframes` list at the top of `Stage` in `src/Demo.tsx` |
| Encoding quality | `remotion.config.ts` |

To see single frames quickly, run `node render-stills.mjs Demo 300 632 700`. It writes PNG files to `out/stills/`.

## License

Remotion has its own license, separate from the MIT license of this project. Read [remotion.dev/license](https://www.remotion.dev/license) to find out if you need a company license.
