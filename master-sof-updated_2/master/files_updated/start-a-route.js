/* ==========================================================================
   Start a Route — enquiry form, sent with EmailJS (no backend)

   The bare "@emailjs/browser" specifier below is resolved by the import map
   in start-a-route.html, so this works with no bundler and no npm install.
   If you later add a bundler (Vite/webpack), run

       npm install @emailjs/browser

   and the same import line keeps working — drop the import map then.

   Only the EmailJS PUBLIC key is used here, which is designed to live in
   frontend code. Never put an SMTP password or a private key in this file.
   ========================================================================== */

import emailjs from '@emailjs/browser';

/* --------------------------------------------------------------------------
   ENTER YOUR EMAILJS CREDENTIALS HERE  (dashboard.emailjs.com)

     PUBLIC KEY  -> Account         > General
     SERVICE ID  -> Email Services  > your service
     TEMPLATE ID -> Email Templates > your template
   -------------------------------------------------------------------------- */

const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';

/* ---------------------- nothing below needs editing ---------------------- */

// Where enquiries go when the mailto fallback is used. Once EmailJS is
// configured the destination is the "To Email" field of your template.
const RECEIVER_EMAIL = 'odds.shotsofjoy@gmail.com';
const EMAIL_SUBJECT = 'New Gifting Enquiry - Shots of Joy';

const SUCCESS_MESSAGE = 'Your request has been sent successfully!';
const FAILURE_MESSAGE = 'Failed to send your request. Please try again.';
const MAILTO_MESSAGE =
  'Your email app is opening with your enquiry ready to go — just press Send.';

// True once all three EmailJS values have been filled in.
const PLACEHOLDER_VALUES = ['YOUR_PUBLIC_KEY', 'YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID'];
const emailjsConfigured = [
  EMAILJS_PUBLIC_KEY,
  EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID
].every((value) => value && !PLACEHOLDER_VALUES.includes(value));

const form = document.querySelector('.route-form');

if (form) {
  const button = form.querySelector('.route-form__submit');
  const status = form.querySelector('.route-form__status');
  const idleLabel = button ? button.textContent.trim() : 'SUBMIT';

  const fields = {
    name: form.querySelector('#route-name'),
    organisation: form.querySelector('#route-organisation'),
    occasion: form.querySelector('#route-occasion'),
    quantity: form.querySelector('#route-quantity'),
    contactNumber: form.querySelector('#route-phone'),
    email: form.querySelector('#route-email')
  };

  let sending = false;

  const valueOf = (key) => (fields[key] ? fields[key].value.trim() : '');

  // something@something.tld, no spaces
  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

  function showStatus(message, kind) {
    if (!status) return;
    status.textContent = message;
    status.className = `route-form__status is-${kind}`;
    status.hidden = false;
  }

  function clearStatus() {
    if (!status) return;
    status.hidden = true;
    status.textContent = '';
    status.className = 'route-form__status';
  }

  function clearInvalid() {
    Object.values(fields).forEach((field) => {
      if (field) field.removeAttribute('aria-invalid');
    });
  }

  function flagField(field, message) {
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
    showStatus(message, 'error');
    return false;
  }

  function setSending(isSending) {
    sending = isSending;
    if (!button) return;
    button.disabled = isSending;
    button.textContent = isSending ? 'SENDING...' : idleLabel;
  }

  /* -- validation: first failing rule wins, and its field gets focus -- */
  function validate() {
    clearInvalid();

    if (!valueOf('name')) {
      return flagField(fields.name, 'Please enter your name.');
    }
    if (!valueOf('organisation')) {
      return flagField(fields.organisation, 'Please enter your organisation.');
    }
    if (!valueOf('occasion')) {
      return flagField(fields.occasion, 'Please enter the gifting occasion.');
    }

    const quantity = Number(valueOf('quantity'));
    if (!valueOf('quantity') || !Number.isFinite(quantity) || quantity < 1) {
      return flagField(fields.quantity, 'Please enter a quantity of 1 or more.');
    }
    if (!valueOf('contactNumber')) {
      return flagField(fields.contactNumber, 'Please enter your contact number.');
    }
    if (!isEmail(valueOf('email'))) {
      return flagField(
        fields.email,
        'Please enter a valid email address, for example name@example.com.'
      );
    }
    return true;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (sending) return; // no double submissions

    clearStatus();
    if (!validate()) return;

    const templateParams = {
      name: valueOf('name'),
      organisation: valueOf('organisation'),
      occasion: valueOf('occasion'),
      quantity: valueOf('quantity'),
      contact_number: valueOf('contactNumber'),
      email: valueOf('email')
    };

    // No EmailJS credentials yet -> hand the enquiry to the visitor's own mail
    // app instead of firing a request that EmailJS will reject with a 400.
    // Delete this block once EMAILJS_* above hold real values.
    if (!emailjsConfigured) {
      const body = [
        `Name: ${templateParams.name}`,
        `Organisation: ${templateParams.organisation}`,
        `Gifting Occasion: ${templateParams.occasion}`,
        `Quantity: ${templateParams.quantity}`,
        `Contact Number: ${templateParams.contact_number}`,
        `Contact Mail Address: ${templateParams.email}`
      ].join('\r\n');

      const mailto =
        `mailto:${RECEIVER_EMAIL}` +
        `?subject=${encodeURIComponent(EMAIL_SUBJECT)}` +
        `&body=${encodeURIComponent(body)}`;

      // an anchor click is handled more reliably than assigning location.href
      const link = document.createElement('a');
      link.href = mailto;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();

      showStatus(MAILTO_MESSAGE, 'success');
      return;
    }

    setSending(true);

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, {
        publicKey: EMAILJS_PUBLIC_KEY
      });

      form.reset();
      clearInvalid();
      showStatus(SUCCESS_MESSAGE, 'success');
    } catch (error) {
      // the real reason, for debugging in DevTools
      console.error('EmailJS send failed:', error);
      showStatus(FAILURE_MESSAGE, 'error');
    } finally {
      setSending(false);
    }
  });
}
