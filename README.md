# Campus Companion

A static student organizer built for `GitHub Pages + Firebase`.

It includes:

- Firebase Authentication with email/password login
- Cloud Firestore for profile, timetable, class notes, tech notes, and daily work
- Firebase Storage for uploaded daily work files

## Files you need to configure

- `firebase-config.js`
- `firestore.rules`
- `storage.rules`

## Local run

1. Update `firebase-config.js` with your Firebase web app config.
2. Run `./start.sh`
3. Open `http://localhost:8000`

## Firebase setup

1. Create a Firebase project.
2. Add a Web App in Firebase and copy its `firebaseConfig` into `firebase-config.js`.
3. Enable `Authentication -> Sign-in method -> Email/Password`.
4. Create a `Cloud Firestore` database.
5. Create `Firebase Storage`.
6. Apply the rules from `firestore.rules` and `storage.rules`.

## GitHub Pages deploy

This repo now includes `.github/workflows/deploy-pages.yml`.

To publish:

1. Push to `main`
2. In GitHub open `Settings -> Pages`
3. Set `Source` to `GitHub Actions`
4. Wait for the Pages workflow to finish

Your site URL should be:

- `https://preetham078.github.io/workbook/`

## Notes

- Firebase config values are safe to place in the frontend app.
- Your data security comes from Firebase Authentication and security rules.
- Files and notes sync across devices when you log into the same account.
