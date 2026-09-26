# Privacy policy

Last updated: September 26, 2026

Daybow is an open-source Chrome extension, with an optional web app, that gives each event on your Google Calendar a category label. This policy covers the Daybow Chrome extension and the Daybow web app. The source code is at https://github.com/karthikvetrivel/Daybow.

## What Daybow accesses

- The events on your primary Google Calendar, through the Google Calendar API. Daybow asks for the `calendar.events` and `calendar.calendars` scopes.
- Your email address, through Google sign-in, to show which account is connected.
- On calendar.google.com, the title that you type into Google's event dialog or editor, to predict its category while you type.

## What Daybow changes

Daybow changes only the label or color of an event, and it creates the category labels on your calendar. It never changes titles, times, guests, descriptions, or notifications. Updates use `sendUpdates=none`, so guests get no emails.

## What Daybow stores

- The extension stores its data in your browser, in Chrome's extension storage. It keeps a Google access token, your email address, your categories and settings, and one decision per labeled event: the event id, a content hash, and the category. It also keeps a cache of up to 400 titles that you typed, with their predicted categories.
- The web app stores your email address, an encrypted Google refresh token, your time zone, the ids of the labels that it created, your categories, and one decision per event. It does not store event titles or descriptions.

## Who receives your data

To pick a category, Daybow sends event details to Jev, a classification model from TypeSafe (https://typesafe.ai), over HTTPS. For an event on your calendar, Daybow sends the title, a short excerpt of the description, the location, the start and end times, and the number of attendees and their email domains. While you type a new event, Daybow sends only the title. TypeSafe states a zero data retention policy for Jev.

Daybow sends your data to no one else. Daybow does not sell your data, does not use it for advertising, and uses no analytics or tracking.

## Google user data

Daybow's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## How to delete your data

- In the extension, click "Sign out and forget my data" on the Daybow page. When you remove the extension, Chrome also deletes its storage.
- In the web app, click "Disconnect and delete my data".
- To revoke Google access, open https://myaccount.google.com/permissions and remove Daybow.

Labels that Daybow already applied stay on your events until you change them.

## Contact

Open an issue at https://github.com/karthikvetrivel/Daybow/issues. Report security problems through the repository's private vulnerability reporting.
