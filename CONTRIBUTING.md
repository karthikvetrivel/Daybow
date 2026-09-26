# Contributing

Thank you for helping. This guide explains how to set up the project, what the parts do, and what a good pull request contains.

## Set up

1. Install Node.js 22 or later.
2. Run `npm install`.
3. Run `npm run check`. It type-checks the web app and the extension, then runs the tests.

To run the web app, copy `.env.example` to `.env.local` and fill in the values. To try the extension, follow "Install the extension" and "Set up Google sign-in" in the README. You need your own Google OAuth client and your own Jev API key.

## Where things live

| Path | Contents |
|---|---|
| `lib/labeler.ts` | The labeling pass, the fast path for single events, and label sync with Google |
| `lib/taxonomy.ts` | The default categories and the criteria that Jev reads |
| `lib/google.ts` | The Calendar API client |
| `lib/jev.ts` | The Jev client |
| `extension/src/paint.ts` | The painter that recolors chips on the Calendar page |
| `extension/src/content.ts` | The content script: title predictions, new chips, polls |
| `extension/src/background.ts` | The service worker: sign-in, sweeps, fast writes |
| `app/` | The Next.js web app |
| `ui/category-calendar.ts` | The categories editor, shared by the extension and the web app |
| `lib/palette.ts`, `lib/week.ts` | The preset pastel colors and the sample week that the editor draws |
| `tests/` | Unit, DOM, and flow tests |

## Rules for changes

- Keep the labeler in `lib/` free of Node-only and browser-only APIs. The extension and the web app share it.
- Call `fetch` without a receiver. A call like `this.fetchImpl(url)` fails in browsers with "Illegal invocation".
- If you change how the painter reads Google Calendar's page, copy the new markup into `tests/paint.test.ts`.
- Keep the editor in `ui/` free of frameworks, because the extension page and the web app both mount it. Put user text into the page with `textContent` or `value`, never with `innerHTML`.
- Use fictional data in tests, examples, and screenshots. Do not commit real event titles, emails, or keys.
- Keep user-facing text short and plain.

## Tests

- `npm test` runs every test. The live Jev test runs only when `TYPESAFE_API_KEY` is set.
- `npm run eval` measures accuracy on an export of your own calendar in `.data/real-events.json`. The folder is gitignored. Do not commit the export or its results.

## Pull requests

1. Open an issue first for a large change, so that we can agree on the approach.
2. Keep each pull request to one change.
3. Run `npm run check` before you push.
4. Describe how you tested the change.
