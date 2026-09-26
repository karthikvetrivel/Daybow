# Chrome extension

The extension is the whole product in one install: Google sign-in, labeling, the categories editor, and the instant color on the Calendar page. It runs in your browser and needs no server. To install it, follow [Install the extension](../README.md#install) and [Set up Google sign-in](../README.md#set-up-google-sign-in) in the main README.

## Build

```
npm run build:extension                    # users paste their own Jev key
EMBED_JEV_KEY=1 npm run build:extension    # embeds TYPESAFE_API_KEY from .env.local as the default key
```

The build writes the `extension/dist` folder. Load that folder with "Load unpacked" in `chrome://extensions`. Do not share a build made with `EMBED_JEV_KEY=1`, because it contains your Jev key.

The first build creates `extension/key.pem`, a private key that fixes the extension id on your machine. The id sets the OAuth redirect URI, `https://<extension-id>.chromiumapp.org/`, and the build prints both. If you delete the key, the next build creates a new id. Then you must add the new redirect URI to your OAuth client.

The extension takes its version from `package.json`.

## Use

1. Click the extension's icon in the toolbar. The configuration page opens.
2. Click "Sign in with Google" and approve the Google screens. Until Google verifies the app, it first shows an "unverified app" warning. Click "Advanced", then "Go to" your app name.
3. The first pass starts at once. After that, a new event gets its category color when its chip appears.

The configuration page also holds the categories editor, the Jev key, and three tuning values: minimum confidence, sweep interval, and date window. The editor shows your categories as a week in Google Calendar's style. Click an event to recolor its category or edit what it catches. "Sign out and forget my data" removes everything that the extension stored.

## How it works

| File | Job |
|---|---|
| `src/auth.ts` | Signs in with Chrome's identity API and Google's implicit OAuth flow, so no client secret ships in the extension. |
| `src/background.ts` | The service worker. Runs the shared labeler from `lib/labeler.ts` against the Calendar API and Jev. Sweeps every 5 minutes by default, and gets a new Google token 5 minutes before the old one expires. |
| `src/content.ts` | The content script on calendar.google.com. Asks for a prediction while you type and paints each new chip in the frame where it appears. Polls every 20 seconds while the tab is visible. |
| `src/draft.ts` | Finds the title field in Google's event dialog and in the full editor. |
| `src/paint.ts` | The painter. Its comments describe the parts of Google Calendar's page that it relies on. |
| `src/paints.ts` | Records the color that each labeled event must show, for the content script. |
| `src/predict.ts` | The title cache and the prediction call. |
| `src/retry.ts` | Retries the label write until Google has stored the new event. |
| `src/store.ts` | The user record and the configuration values, in `chrome.storage.local`. |
| `src/options.ts`, `static/` | The configuration page. The categories editor comes from `ui/category-calendar.ts`, which the web app shares. |
| `manifest.template.json` | The manifest. The build fills in the public key and the version. |

The web app and the extension can run at the same time for one account. The first one to see an event labels it, and the other finds nothing to do.
