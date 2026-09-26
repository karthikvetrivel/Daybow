import { AppBar } from "../ui";

export const metadata = { title: "Privacy · Daybow" };

export default function Privacy() {
  return (
    <>
    <AppBar />
    <main>
      <h1>Privacy</h1>
      <p className="muted">What this service stores, why, and how to delete it.</p>
      <div className="card">
        <p><b>What we access.</b> After you sign in with Google, the service reads events on your primary calendar and writes one field per event: its label (or, when labels are not available, its color). It also creates the label set on your calendar. It never changes titles, times, guests, or notifications, and never sends invitations or emails.</p>
        <p><b>What we store.</b> Your email address, an encrypted Google refresh token, your calendar time zone, the ids of the labels created for you, and a small record per event (an id, a content hash, and the decision) so the same event is not processed twice. Event titles and descriptions are not stored.</p>
        <p><b>Who sees event text.</b> To choose a label, the title, description excerpt, location, time, attendee count, and attendee email domains of an event are sent to TypeSafe&apos;s Jev model over HTTPS. TypeSafe states a zero data retention policy for this model. Nothing else receives your data.</p>
        <p><b>Deleting your data.</b> Open the home page while signed in and choose &quot;Disconnect and delete my data&quot;. That revokes the Google token, stops notifications, and deletes every stored record for your account at once. You can also remove the app at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>
        <p><b>Google API Services User Data Policy.</b> This app&apos;s use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      </div>
      <p className="muted" style={{ marginTop: 16 }}><a href="/">Back</a></p>
    </main>
    </>
  );
}
