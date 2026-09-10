# Shots of Joy — enquiry backend

Receives the Start-a-Route form and emails it on. It also serves the existing
static site, so in normal use the page and the API share an origin.

## Setup

```bash
cd server
npm install
cp .env.example .env     # then edit .env
npm start                # http://localhost:3000
```

Open <http://localhost:3000/start-a-route.html>.

`.env` is gitignored and lives outside the served directory, so it is never
reachable from the browser. Nothing in it may be copied into HTML/CSS/JS.

### Gmail

`SMTP_PASS` must be a 16-character **App Password**, not the account password:
Google Account → Security → 2-Step Verification → App passwords. Gmail rejects
plain passwords over SMTP.

## API

`POST /api/contact`

```json
{ "name": "", "organisation": "", "giftingOccasion": "",
  "quantity": 1, "contactNumber": "", "contactEmail": "" }
```

| Status | Meaning |
| ------ | ------- |
| 200 | Sent. `{ ok: true, message }` |
| 400 | Validation failed. `{ ok: false, message, errors: { field: reason } }` |
| 403 | Origin not in `ALLOWED_ORIGINS` |
| 413 | Body over 10 kB |
| 429 | More than 20 enquiries in 15 minutes from one IP |
| 502 | SMTP refused the message |
| 503 | Server has no mail configuration yet |

`GET /api/health` → `{ ok, configured }`.

Error responses never contain SMTP host, user or password; failures are logged
server-side only.

## Testing without SMTP credentials

`SMTP_TRANSPORT=json` swaps in nodemailer's JSON transport — the message is
built and logged rather than delivered, so the whole route can be exercised
without a real mailbox:

```bash
SMTP_TRANSPORT=json CONTACT_RECEIVER=test@example.com npm start
```

## Deploying the frontend separately

If the pages are hosted somewhere other than this server, add that origin to
`ALLOWED_ORIGINS`. `start-a-route.js` posts to `/api/contact` on the current
origin (falling back to `http://localhost:3000` only when opened from `file://`),
so point it at the deployed API if the two are split.
