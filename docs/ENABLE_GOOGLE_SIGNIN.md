# Enabling Google Sign-In with Firebase Authentication

ParcelFlow supports Google Sign-In for **Customer** accounts. For security, Operators and Administrators must authenticate using enterprise passwords.

If Firebase configuration is not present, the backend cleanly reports `google_login_unavailable` and the login interface automatically hides the Google button.

Follow these steps to activate Google Sign-In:

---

## 1. Firebase Console Setup

1. Open the [Firebase Console](https://console.firebase.google.com/) and create a new project (e.g. `parcelflow-app`).
2. Navigate to **Build > Authentication > Sign-in method**.
3. Click **Add new provider** and select **Google**.
4. Toggle **Enable**, choose your project support email, and click **Save**.
5. Under **Authorized domains**, ensure `localhost` is listed (it is added by default).

---

## 2. Obtain Client & Server Config

1. Go to **Project Settings** (gear icon) > **General**.
2. Under **Your apps**, click the **Web icon (`</>`)** to register a web app (e.g. `parcelflow-web`).
3. Copy the configuration parameters into your `.env` file:

```env
# Server token verification (RS256 verified against Google's public keys)
FIREBASE_PROJECT_ID="your-firebase-project-id"

# Frontend Firebase SDK Configuration
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="your-firebase-project-id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-firebase-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-firebase-project-id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="1234567890"
VITE_FIREBASE_APP_ID="1:1234567890:web:abcdef"
```

---

## 3. Verify Server Startup

Restart the ParcelFlow backend server:

```bash
npm run dev
```

During initialization, the server will output:
```
[ParcelFlow] Google login: enabled (project: your-firebase-project-id)
```

The Google Sign-In button will now appear on the login page for customer authentication.
