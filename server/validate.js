'use strict';

/**
 * Validation + sanitisation for the Start-a-Route enquiry payload.
 * Kept separate from the transport so it can be unit-tested on its own.
 */

const MAX = {
  name: 100,
  organisation: 120,
  giftingOccasion: 120,
  contactNumber: 30,
  contactEmail: 254,
};

// Control characters (incl. CR/LF) are stripped rather than escaped: they have
// no legitimate place in these fields and CR/LF in a value that reaches a mail
// header is the classic header-injection vector.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function clean(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').trim().replace(/\s{2,}/g, ' ');
}

// Deliberately conservative: one @, no spaces, a dot-separated domain.
const EMAIL_RE = /^[^\s@,;:<>()[\]]+@[^\s@.,;:<>()[\]]+(\.[^\s@.,;:<>()[\]]+)+$/;
const PHONE_RE = /^[0-9+()\-.\s]{5,30}$/;

function validateEnquiry(body) {
  const errors = {};
  const src = body && typeof body === 'object' ? body : {};

  const name = clean(src.name);
  const organisation = clean(src.organisation);
  const giftingOccasion = clean(src.giftingOccasion);
  const contactNumber = clean(src.contactNumber);
  const contactEmail = clean(src.contactEmail).toLowerCase();

  if (!name) errors.name = 'Name is required.';
  else if (name.length > MAX.name) errors.name = `Name must be ${MAX.name} characters or fewer.`;

  // Organisation is the one optional field.
  if (organisation.length > MAX.organisation) {
    errors.organisation = `Organisation must be ${MAX.organisation} characters or fewer.`;
  }

  if (!giftingOccasion) errors.giftingOccasion = 'Gifting occasion is required.';
  else if (giftingOccasion.length > MAX.giftingOccasion) {
    errors.giftingOccasion = `Gifting occasion must be ${MAX.giftingOccasion} characters or fewer.`;
  }

  // Accept "50" and 50 alike, but reject "50 boxes", 0, negatives and decimals.
  const rawQuantity = typeof src.quantity === 'number' ? String(src.quantity) : clean(src.quantity);
  let quantity = null;
  if (!rawQuantity) {
    errors.quantity = 'Quantity is required.';
  } else if (!/^\d+$/.test(rawQuantity)) {
    errors.quantity = 'Quantity must be a whole number.';
  } else {
    quantity = Number(rawQuantity);
    if (quantity < 1) errors.quantity = 'Quantity must be at least 1.';
    else if (quantity > 1000000) errors.quantity = 'Quantity looks too large.';
  }

  if (!contactNumber) errors.contactNumber = 'Contact number is required.';
  else if (!PHONE_RE.test(contactNumber)) errors.contactNumber = 'Contact number is not valid.';

  if (!contactEmail) errors.contactEmail = 'Contact mail address is required.';
  else if (contactEmail.length > MAX.contactEmail || !EMAIL_RE.test(contactEmail)) {
    errors.contactEmail = 'Contact mail address is not valid.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { name, organisation, giftingOccasion, quantity, contactNumber, contactEmail },
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { validateEnquiry, escapeHtml, clean };
