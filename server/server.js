'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const { validateEnquiry, escapeHtml } = require('./validate');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// The existing static site lives here; serving it from the same origin means
// the browser makes a same-origin request to /api/contact and CORS never
// enters the picture. The allowlist below is for when it is hosted elsewhere.
const SITE_DIR = path.resolve(__dirname, '..', 'master-sof-updated_2', 'master', 'files_updated');

app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// CORS - explicit allowlist, not a wildcard
// ---------------------------------------------------------------------------
// Common local dev origins are allowed when ALLOWED_ORIGINS is unset, so the
// form works out of the box behind Live Server / Vite / http-server. Set
// ALLOWED_ORIGINS explicitly in production to lock this down.
const DEV_FALLBACK_ORIGINS = [3000, 5500, 5173, 8080, 8000].reduce((acc, port) => {
  acc.push("http://localhost:" + port, "http://127.0.0.1:" + port);
  return acc;
}, []);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEV_FALLBACK_ORIGINS;

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = same-origin navigation or a non-browser client.
      if (!origin) return callback(null, true);
      if (ORIGIN_ALLOWLIST.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: '10kb' }));

// ---------------------------------------------------------------------------
// Mail transport - built once, from environment only
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'CONTACT_RECEIVER'];

// SMTP_TRANSPORT=json swaps in nodemailer's built-in JSON transport: the
// message is assembled and returned instead of delivered. Used by the test
// script so the whole route can be exercised without real credentials.
const useJsonTransport = process.env.SMTP_TRANSPORT === 'json';

function missingEnv() {
  if (useJsonTransport) return [];
  return REQUIRED_ENV.filter((key) => !process.env[key]);
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (useJsonTransport) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

function buildMessage(data) {
  const rows = [
    ['Name', data.name],
    ['Organisation', data.organisation || '-'],
    ['Gifting Occasion', data.giftingOccasion],
    ['Quantity', String(data.quantity)],
    ['Contact Number', data.contactNumber],
    ['Contact Mail Address', data.contactEmail],
  ];

  const text = rows.map(([label, value]) => label + ': ' + value).join('\n');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#2A2622">' +
    '<h2 style="margin:0 0 16px">New Gifting Enquiry - Shots of Joy</h2>' +
    '<table cellpadding="6" cellspacing="0" border="0">' +
    rows
      .map(
        ([label, value]) =>
          '<tr><td style="font-weight:700;vertical-align:top">' +
          escapeHtml(label) +
          ':</td><td>' +
          escapeHtml(value) +
          '</td></tr>'
      )
      .join('') +
    '</table></div>';

  return {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.CONTACT_RECEIVER,
    replyTo: data.contactEmail,
    subject: 'New Gifting Enquiry - Shots of Joy',
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// POST /api/contact
// ---------------------------------------------------------------------------
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many enquiries from this address. Please try again later.' },
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  const { valid, errors, data } = validateEnquiry(req.body);

  if (!valid) {
    return res.status(400).json({
      ok: false,
      message: 'Please check the highlighted fields and try again.',
      errors,
    });
  }

  const missing = missingEnv();
  if (missing.length) {
    // Say that it is unconfigured, never which values are absent.
    console.error('[contact] refused: missing env ->', missing.join(', '));
    return res.status(503).json({
      ok: false,
      message: 'The enquiry service is not configured yet. Please try again later.',
    });
  }

  try {
    const info = await getTransporter().sendMail(buildMessage(data));
    console.log('[contact] sent', info.messageId || '(json transport)');
    return res.status(200).json({
      ok: true,
      message: 'Thank you! Your gifting enquiry has been submitted successfully.',
    });
  } catch (err) {
    // Log server-side detail; return nothing that could leak host/user/pass.
    console.error('[contact] send failed:', err && err.message);
    return res.status(502).json({
      ok: false,
      message: 'We could not send your enquiry right now. Please try again in a moment.',
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: missingEnv().length === 0 });
});

// ---------------------------------------------------------------------------
// Static site - unchanged pages, served from the same origin as the API
// ---------------------------------------------------------------------------
app.use(express.static(SITE_DIR, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(SITE_DIR, 'index.html')));

// Body parser / CORS rejections land here.
app.use((err, req, res, next) => {
  if (err && err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ ok: false, message: 'Origin not allowed.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, message: 'Request payload too large.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, message: 'Malformed JSON payload.' });
  }
  console.error('[server] unhandled:', err && err.message);
  return res.status(500).json({ ok: false, message: 'Unexpected server error.' });
});

if (require.main === module) {
  const missing = missingEnv();
  if (missing.length) {
    console.warn('[server] WARNING - not configured to send mail. Missing: ' + missing.join(', '));
    console.warn('[server] Copy server/.env.example to server/.env and fill it in.');
  }
  app.listen(PORT, () => {
    console.log('[server] listening on http://localhost:' + PORT);
    console.log('[server] serving site from ' + SITE_DIR);
  });
}

module.exports = app;
