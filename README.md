# Campus Companion

A login-based academic organizer for:

- student academic details
- weekly college timetable
- class notes
- technology learning notes
- daily work records with file uploads

## How to run

1. Run `./start.sh`
2. Open `http://localhost:8000`
3. Create an account and start saving your records

## Where data is stored

- SQLite database: `storage/campus_companion.db`
- Uploaded files: `storage/uploads/`

## Cross-device use

If you want to open the same account from another device, run this app on one machine that both devices can reach on the same network or deploy it on a server/VPS.

Then open:

- `http://localhost:8000` on the same machine
- `http://YOUR-COMPUTER-IP:8000` from another device on the same Wi-Fi
