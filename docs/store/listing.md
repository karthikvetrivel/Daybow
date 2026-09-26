# Chrome Web Store listing

Everything that the Chrome Web Store Developer Dashboard asks for, ready to paste. Upload `release/daybow-<version>-chrome-web-store.zip`, which `npm run package:extension` creates. The store assigns its own extension id. Add `https://<that id>.chromiumapp.org/` to the authorized redirect URIs of your Google OAuth client, or sign-in fails for store installs.

## Store listing

Name and summary come from the manifest: "Daybow" and "Every Google Calendar event, color-coded by category as you create it. Jev from TypeSafe picks the category."

Description:

```
Daybow gives every event on your Google Calendar a category and a pastel color, as you create it.

HOW IT WORKS
• Type a title in Google Calendar. Jev, a classification model from TypeSafe, predicts the category while you type.
• Save the event. It appears already colored, before Google finishes saving it.
• Daybow writes real Google Calendar labels, so the colors also show on your phone.
• The first run labels the past 7 days and the next 60 days.

YOUR CATEGORIES
Start with nine pastel categories: Meeting, Focus, Fitness, Health, Social, Travel, Family, Personal, and Routine. Edit them on a week that looks like Google Calendar: pick from 24 pastel colors, rename a category, describe it, or add example titles.

SETUP
1. Click "Sign in with Google" on the Daybow page, which opens after you install.
2. Paste your Jev API key from console.typesafe.ai/keys.

PRIVACY
• Daybow runs in your browser. It keeps no event titles, except titles that you type, for its prediction cache.
• To pick a category, Daybow sends an event's title, a short description excerpt, the location, the times, and attendee counts and domains to Jev. TypeSafe states a zero data retention policy for Jev.
• Daybow changes only the label or color of an event. Guests get no emails.

Open source (MIT): https://github.com/karthikvetrivel/Daybow
```

- Category: Productivity, "Workflow & Planning". If that subcategory does not exist, pick the closest productivity category.
- Language: English.
- Store icon: comes from the package (`icons/icon-128.png`).
- Screenshots, 1280 x 800, in this order: `docs/store/screenshot-1.png` to `docs/store/screenshot-5.png`.
- Small promo tile, 440 x 280: `docs/store/promo-small-440x280.png`.
- Homepage URL: https://github.com/karthikvetrivel/Daybow
- Support URL: https://github.com/karthikvetrivel/Daybow/issues
- Mature content: No.

## Privacy practices

Single purpose:

```
Daybow color-codes the events on the user's Google Calendar by category. It picks a category for each event, writes it as a Google Calendar label, and shows the color on the Google Calendar page while the user creates the event.
```

Permission justifications:

| Permission | Justification |
|---|---|
| identity | Daybow signs the user in with Google through chrome.identity.launchWebAuthFlow. The access token lets Daybow read events and write category labels through the Google Calendar API. |
| alarms | Daybow runs a labeling sweep every few minutes, and it renews the Google access token before the token expires. |
| storage | Daybow stores the user's categories, settings, Google access token, and one labeling decision per event in chrome.storage. |
| Host permissions | www.googleapis.com: the Google Calendar API and the user's email address. oauth2.googleapis.com: revoking the Google token when the user signs out. api.typesafe.ai: Jev, the model that picks each event's category. calendar.google.com (content script): reads the title that the user types in Google's event dialog to predict its category, and recolors events on the page. |

Remote code: "No, I am not using remote code."

Data usage. Check these data types:

- Personally identifiable information: the user's email address.
- Authentication information: the Google access token.
- User activity: the title that the user types in Google Calendar's event dialog.
- Website content: event titles and details from Google Calendar.

Check all three certifications: no sale of user data, no use unrelated to the single purpose, no use for creditworthiness or lending.

Privacy policy URL: https://github.com/karthikvetrivel/Daybow/blob/main/PRIVACY.md

## Distribution

- Visibility: Unlisted. Only people with the link can find and install it.
- Regions: all regions.
- Payments: free.
