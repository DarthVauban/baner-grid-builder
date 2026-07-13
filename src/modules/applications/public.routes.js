import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { publishChatUpdates } from '../chat/chat.events.js';
import { createNotification } from '../notifications/notification.service.js';
import { publishNotificationUpdates } from '../notifications/notification.events.js';
import {
  buildSafeProductSnapshot,
  buildButtonScriptBody,
  buildUtm,
  cleanText,
  cleanUrl,
  generateApplicationNumber,
  getApplicationRecipientIds,
  loadApplicationView,
  loadPublishedForm
} from './application.service.js';
import { publishApplicationUpdates } from './application.events.js';

const router = Router();
const publicIdSchema = z.string().uuid();
const buttonIdSchema = z.string().uuid();
const publicSubmissionSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  product: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().max(160).optional().default(''),
  honeypot: z.string().trim().max(200).optional().default('')
});

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Забагато спроб. Спробуйте пізніше.' } }
});

function publicFormPayload(form) {
  return {
    id: form.publicId,
    name: form.name,
    title: form.title,
    description: form.description,
    buttonText: form.buttonText,
    successMessage: form.successMessage,
    settings: form.settings,
    styles: form.styles,
    fields: form.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      placeholder: field.placeholder,
      helpText: field.helpText,
      defaultValue: field.defaultValue,
      required: field.required,
      system: field.system,
      systemFieldType: field.systemFieldType,
      sortOrder: field.sortOrder,
      options: field.systemFieldType === 'bank'
        ? form.banks.map((bank) => ({ label: bank.label, value: bank.value }))
        : field.options.filter((option) => option.active).map((option) => ({ label: option.label, value: option.value }))
    }))
  };
}

function publicOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const candidate = forwardedHost ? `${forwardedProto}://${forwardedHost}` : `${req.protocol}://${req.get('host')}`;
  try { return new URL(candidate).origin; } catch { return ''; }
}

function findOptionLabel(field, value) {
  if (field.systemFieldType === 'bank') {
    const bank = field.options.find((option) => option.value === value);
    return bank?.label || '';
  }
  const option = field.options.find((item) => item.value === value);
  return option?.label || '';
}

function validateSubmission(form, rawValues) {
  const values = new Map();
  const errors = [];
  for (const field of form.fields) {
    if (!field.active) continue;
    const raw = rawValues[field.key];
    const value = typeof raw === 'boolean' ? String(raw) : cleanText(raw, 3000);
    if (field.required && !value) errors.push({ field: field.key, message: `Заповніть поле «${field.label}».` });
    if (field.systemFieldType === 'bank' && value && !field.options.some((option) => option.value === value)) {
      errors.push({ field: field.key, message: 'Обраний банк недоступний.' });
    }
    if (['select', 'radio'].includes(field.type) && field.systemFieldType !== 'bank' && value && !field.options.some((option) => option.active !== false && option.value === value)) {
      errors.push({ field: field.key, message: `Обране значення поля «${field.label}» недоступне.` });
    }
    if (field.type === 'phone' && value && !/^\+?[0-9\s().-]{7,30}$/.test(value)) {
      errors.push({ field: field.key, message: 'Вкажіть коректний телефон.' });
    }
    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({ field: field.key, message: 'Вкажіть коректний email.' });
    }
    values.set(field.key, value);
  }
  if (errors.length) throw new AppError(422, 'VALIDATION_ERROR', 'Перевірте заповнені поля.', errors);
  return values;
}

function loaderScript() {
  return `(function(){
  "use strict";
  if (window.MTApplicationForms) return;
  var loaderScript = document.currentScript || document.querySelector('script[data-mt-application-loader="true"]');
  var apiBase = (function(){
    try { return new URL("/api/public/application-forms", loaderScript && loaderScript.src ? loaderScript.src : window.location.href).toString().replace(/\\/$/, ""); }
    catch (error) { return "/api/public/application-forms"; }
  })();
  function el(tag, className){ var node = document.createElement(tag); if (className) node.className = className; return node; }
  function phoneDigits(value){
    var digits = String(value || "").replace(/\\D/g, "");
    if (digits.indexOf("380") === 0) digits = digits.slice(3);
    if (digits.charAt(0) === "0") digits = digits.slice(1);
    return digits.slice(0, 9);
  }
  function formatPhone(value){
    var digits = phoneDigits(value);
    if (!digits) return "";
    var result = "+380";
    if (digits.length > 0) result += " (" + digits.slice(0, 2);
    if (digits.length >= 2) result += ")";
    if (digits.length > 2) result += " " + digits.slice(2, 5);
    if (digits.length > 5) result += "-" + digits.slice(5, 7);
    if (digits.length > 7) result += "-" + digits.slice(7, 9);
    return result;
  }
  function attachPhoneMask(input){
    input.inputMode = "tel";
    input.autocomplete = "tel";
    input.placeholder = "+380 (__) ___-__-__";
    input.pattern = "\\\\+380 \\\\([0-9]{2}\\\\) [0-9]{3}-[0-9]{2}-[0-9]{2}";
    input.title = "Введіть номер у форматі +380 (__) ___-__-__";
    input.addEventListener("focus", function(){ if (!input.value) input.value = "+380 "; });
    input.addEventListener("input", function(){ input.value = formatPhone(input.value) || "+380 "; if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length); });
    input.addEventListener("blur", function(){ if (!phoneDigits(input.value)) input.value = ""; });
    if (input.value) input.value = formatPhone(input.value);
  }
  function errorMessage(error, fallback){
    var message = error && error.message ? error.message : fallback;
    if (/failed to fetch|networkerror/i.test(message || "")) return "Не вдалося з'єднатися з сервером. Спробуйте ще раз.";
    return message || fallback;
  }
  function fieldControl(field){
    var wrap = el(field.type === "radio" ? "div" : "label", "mtf-field");
    var label = el("span"); label.textContent = field.label + (field.required ? " *" : "");
    wrap.appendChild(label);
    var input;
    if (field.type === "textarea") { input = document.createElement("textarea"); input.rows = 3; }
    else if (field.type === "select" || field.systemFieldType === "bank") {
      input = document.createElement("select");
      var empty = document.createElement("option"); empty.value = ""; empty.textContent = "Оберіть"; input.appendChild(empty);
      (field.options || []).forEach(function(option){ var item = document.createElement("option"); item.value = option.value; item.textContent = option.label; input.appendChild(item); });
    } else if (field.type === "radio") {
      input = el("div", "mtf-choice-list");
      (field.options || []).forEach(function(option, index){
        var choice = el("label", "mtf-choice");
        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = field.key;
        radio.value = option.value;
        if (field.required && index === 0) radio.required = true;
        choice.appendChild(radio);
        choice.appendChild(document.createTextNode(option.label));
        input.appendChild(choice);
      });
    } else if (field.type === "checkbox") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.value = "true";
    } else {
      input = document.createElement("input");
      input.type = field.type === "phone" ? "tel" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text";
    }
    if (field.type !== "radio") {
      input.name = field.key;
      input.placeholder = field.placeholder || "";
      if (field.type !== "checkbox") input.value = field.defaultValue || "";
      if (field.required) input.required = true;
      if (field.type === "phone" || field.systemFieldType === "phone") attachPhoneMask(input);
    }
    wrap.appendChild(input);
    if (field.helpText) { var help = el("small"); help.textContent = field.helpText; wrap.appendChild(help); }
    return wrap;
  }
  function injectStyles(){
    if (document.getElementById("mtf-styles")) return;
    var style = document.createElement("style");
    style.id = "mtf-styles";
    style.textContent = ".mtf-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.46)}.mtf-modal{width:min(520px,100%);max-height:min(760px,100%);overflow:auto;border-radius:var(--mtf-radius,18px);background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.24);font-family:Arial,sans-serif;color:#172033}.mtf-head{display:flex;gap:14px;justify-content:space-between;padding:22px 22px 12px}.mtf-head h2{margin:0;font-size:24px;line-height:1.2}.mtf-head p{margin:8px 0 0;color:#667085;line-height:1.45}.mtf-close{width:38px;height:38px;border:0;border-radius:10px;background:#f2f4f7;font-size:24px}.mtf-form{display:grid;gap:14px;padding:0 22px 22px}.mtf-field{display:grid;gap:7px}.mtf-field span{font-size:14px;font-weight:700}.mtf-field input,.mtf-field select,.mtf-field textarea{width:100%;border:1px solid #d8dee8;border-radius:var(--mtf-control-radius,12px);padding:12px 13px;font:inherit}.mtf-field input[type=checkbox],.mtf-field input[type=radio]{width:auto;padding:0}.mtf-choice-list{display:grid;gap:8px}.mtf-choice{display:flex;align-items:center;gap:8px;color:#344054;font-size:14px}.mtf-field small{color:#667085;font-size:12px}.mtf-actions{display:grid;gap:10px;align-items:center}.mtf-submit{width:100%;min-height:44px;border:0;border-radius:var(--mtf-control-radius,12px);padding:10px 18px;color:var(--mtf-button-color,#fff);background:var(--mtf-button-bg,#6d5dfc);font-weight:800;cursor:pointer}.mtf-submit:disabled{cursor:not-allowed;opacity:.7}.mtf-error{border:1px solid #ffd7df;border-radius:12px;padding:10px;color:#9f2940;background:#fff0f3}.mtf-success{display:grid;justify-items:center;gap:16px;padding:28px 22px 24px;text-align:center}.mtf-success strong{max-width:420px;font-size:21px;line-height:1.28;text-wrap:balance}.mtf-success small{color:#667085}.mtf-number{width:min(100%,292px);display:grid;justify-items:center;gap:7px;border:1px solid var(--mtf-number-border,#d8d4ff);border-radius:var(--mtf-number-radius,16px);padding:16px 20px;color:var(--mtf-number-color,#172033);background:var(--mtf-number-bg,#f6f4ff)}.mtf-number span{color:var(--mtf-number-label-color,#667085);font-size:12px;font-weight:800;text-transform:uppercase}.mtf-number b{font-size:34px;letter-spacing:.06em;color:var(--mtf-number-color,var(--mtf-button-bg,#6d5dfc))}@media(max-width:560px){.mtf-backdrop{align-items:flex-end;padding:0}.mtf-modal{max-height:92vh;border-radius:18px 18px 0 0}}";
    document.head.appendChild(style);
  }
  function close(backdrop){ backdrop.remove(); document.documentElement.style.overflow = ""; }
  async function open(options){
    injectStyles();
    var formId = options && options.formId;
    if (!formId) return;
    var backdrop = el("div", "mtf-backdrop");
    var modal = el("section", "mtf-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = "<div class='mtf-success'><span>Завантажуємо форму...</span></div>";
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.documentElement.style.overflow = "hidden";
    backdrop.addEventListener("mousedown", function(event){ if (event.target === backdrop) close(backdrop); });
    try {
      var response = await fetch(apiBase + "/" + encodeURIComponent(formId), { credentials: "omit" });
      var payload = await response.json().catch(function(){ return {}; });
      if (!response.ok) throw new Error(payload && payload.error && payload.error.message || "Форма недоступна.");
      var form = payload.data;
      if (!form || typeof form !== "object") throw new Error("Форма недоступна. Перевірте URL скрипта.");
      modal.innerHTML = "";
      var styles = form.styles && typeof form.styles === "object" ? form.styles : {};
      modal.style.setProperty("--mtf-button-bg", styles.buttonBackgroundColor || styles.accentColor || "#6d5dfc");
      modal.style.setProperty("--mtf-button-color", styles.buttonTextColor || "#ffffff");
      modal.style.setProperty("--mtf-radius", styles.borderRadius || "18px");
      modal.style.setProperty("--mtf-control-radius", styles.controlRadius || styles.borderRadius || "12px");
      modal.style.setProperty("--mtf-number-bg", styles.numberBlockBackgroundColor || "#f6f4ff");
      modal.style.setProperty("--mtf-number-border", styles.numberBlockBorderColor || "#d8d4ff");
      modal.style.setProperty("--mtf-number-color", styles.numberBlockTextColor || "#172033");
      modal.style.setProperty("--mtf-number-radius", styles.numberBlockRadius || "16px");
      var head = el("header", "mtf-head");
      var titleWrap = el("div");
      var title = document.createElement("h2"); title.textContent = form.title;
      var description = document.createElement("p"); description.textContent = form.description || "";
      titleWrap.appendChild(title); if (form.description) titleWrap.appendChild(description);
      var closeButton = el("button", "mtf-close"); closeButton.type = "button"; closeButton.textContent = "×"; closeButton.setAttribute("aria-label", "Закрити");
      closeButton.addEventListener("click", function(){ close(backdrop); });
      head.appendChild(titleWrap); head.appendChild(closeButton); modal.appendChild(head);
      var body = el("form", "mtf-form");
      var error = el("div", "mtf-error"); error.hidden = true; body.appendChild(error);
      (form.fields || []).forEach(function(field){ body.appendChild(fieldControl(field)); });
      var trap = document.createElement("input"); trap.name = "company"; trap.tabIndex = -1; trap.autocomplete = "off"; trap.style.cssText = "position:absolute;left:-9999px;opacity:0"; body.appendChild(trap);
      var actions = el("div", "mtf-actions"); var submit = el("button", "mtf-submit"); submit.type = "submit"; submit.textContent = form.buttonText || "Надіслати"; actions.appendChild(submit); body.appendChild(actions);
      body.addEventListener("submit", async function(event){
        event.preventDefault(); error.hidden = true; submit.disabled = true;
        var values = {};
        (form.fields || []).forEach(function(field){
          var control = body.elements[field.key];
          if (!control) return;
          if (field.type === "checkbox") values[field.key] = control.checked ? "true" : "";
          else values[field.key] = control.value || "";
        });
        try {
          var sent = await fetch(apiBase + "/" + encodeURIComponent(formId) + "/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              values: values,
              product: options.product || {},
              context: Object.assign({ sourceUrl: location.href, pageTitle: document.title, referrer: document.referrer }, options.context || {}),
              idempotencyKey: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + Math.random()),
              honeypot: trap.value
            })
          });
          var result = await sent.json();
          if (!sent.ok) throw new Error(result && result.error && result.error.message || "Не вдалося надіслати заявку.");
          modal.innerHTML = ""; var done = el("div", "mtf-success"); var strong = document.createElement("strong"); strong.textContent = form.successMessage || "Заявку надіслано."; var numberBox = el("div", "mtf-number"); var numberLabel = document.createElement("span"); numberLabel.textContent = "Номер заявки"; var numberValue = document.createElement("b"); numberValue.textContent = result.data.number; numberBox.appendChild(numberLabel); numberBox.appendChild(numberValue); var ok = el("button", "mtf-submit"); ok.type = "button"; ok.textContent = "Готово"; ok.addEventListener("click", function(){ close(backdrop); }); done.appendChild(strong); done.appendChild(numberBox); done.appendChild(ok); modal.appendChild(done);
        } catch (submitError) { error.textContent = errorMessage(submitError, "Не вдалося надіслати заявку."); error.hidden = false; submit.disabled = false; }
      });
      modal.appendChild(body);
    } catch (error) {
      modal.innerHTML = ""; var failed = el("div", "mtf-success"); var message = document.createElement("strong"); message.textContent = errorMessage(error, "Не вдалося завантажити форму."); var button = el("button", "mtf-submit"); button.type = "button"; button.textContent = "Закрити"; button.addEventListener("click", function(){ close(backdrop); }); failed.appendChild(message); failed.appendChild(button); modal.appendChild(failed);
    }
  }
  window.MTApplicationForms = { open: open };
})();`;
}

router.get('/loader.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(loaderScript());
});

router.get('/buttons/:id/embed.js', asyncHandler(async (req, res) => {
  const id = parseInput(buttonIdSchema, req.params.id);
  const result = await pool.query(
    `SELECT config.*, form.public_id AS form_public_id
     FROM application_button_configurations AS config
     JOIN application_forms AS form ON form.id = config.form_id
     WHERE config.id = $1 AND config.archived_at IS NULL`,
    [id]
  );
  const config = result.rows[0];
  if (!config) throw new AppError(404, 'BUTTON_CONFIG_NOT_FOUND', 'Конфігурацію кнопки не знайдено.');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buildButtonScriptBody(config, publicOrigin(req)));
}));

router.get('/:publicId', asyncHandler(async (req, res) => {
  const publicId = parseInput(publicIdSchema, req.params.publicId);
  const form = await loadPublishedForm(publicId);
  if (!form) throw new AppError(404, 'FORM_NOT_FOUND', 'Форма недоступна.');
  res.json({ data: publicFormPayload(form) });
}));

router.post('/:publicId/applications', submitLimiter, asyncHandler(async (req, res) => {
  const publicId = parseInput(publicIdSchema, req.params.publicId);
  const input = parseInput(publicSubmissionSchema, req.body);
  if (input.honeypot) return res.status(204).end();
  const form = await loadPublishedForm(publicId);
  if (!form) throw new AppError(404, 'FORM_NOT_FOUND', 'Форма недоступна.');
  if (!form.banks.length) throw new AppError(422, 'BANK_REQUIRED', 'Оберіть банк.');
  const bankField = form.fields.find((field) => field.systemFieldType === 'bank');
  if (bankField) bankField.options = form.banks.map((bank) => ({ label: bank.label, value: bank.value }));
  const values = validateSubmission(form, input.values);
  const context = input.context || {};
  const product = buildSafeProductSnapshot(input.product || {}, context);
  const client = await pool.connect();
  let applicationId;
  let applicationNumber;
  let recipients = [];

  try {
    await client.query('BEGIN');
    if (input.idempotencyKey) {
      const existing = await client.query(
        `SELECT id, application_number
         FROM applications
         WHERE form_public_id = $1 AND idempotency_key = $2`,
        [publicId, input.idempotencyKey]
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return res.status(200).json({ data: {
          id: existing.rows[0].id,
          number: existing.rows[0].application_number,
          duplicate: true
        } });
      }
    }

    applicationNumber = await generateApplicationNumber(client);
    const created = await client.query(
      `INSERT INTO applications (
         application_number, form_id, form_public_id, form_name_snapshot,
         source_url, canonical_url, page_title, referrer, utm, user_agent,
         idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10, $11)
       RETURNING id`,
      [
        applicationNumber,
        form.id,
        form.publicId,
        form.name,
        cleanUrl(context.sourceUrl || ''),
        cleanUrl(context.canonicalUrl || context.sourceUrl || ''),
        cleanText(context.pageTitle || '', 500),
        cleanUrl(context.referrer || ''),
        JSON.stringify(buildUtm(context)),
        cleanText(req.get('user-agent') || '', 500),
        input.idempotencyKey || null
      ]
    );
    applicationId = created.rows[0].id;
    for (const [index, field] of form.fields.entries()) {
      if (!field.active) continue;
      const value = values.get(field.key) || '';
      await client.query(
        `INSERT INTO application_values (
           application_id, field_id, field_key_snapshot, field_label_snapshot,
           field_type_snapshot, system_field_type, value, option_label_snapshot, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          applicationId,
          field.id || null,
          field.key,
          field.label,
          field.type,
          field.systemFieldType,
          value,
          findOptionLabel(field, value),
          field.sortOrder || index
        ]
      );
    }
    await client.query(
      `INSERT INTO application_product_snapshots (
         application_id, title, url, image_url, price, old_price, currency,
         sku, product_code, availability, external_product_id, domain, raw_safe_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB)`,
      [
        applicationId,
        product.title,
        product.url,
        product.imageUrl,
        product.price,
        product.oldPrice,
        product.currency,
        product.sku,
        product.productCode,
        product.availability,
        product.externalProductId,
        product.domain,
        JSON.stringify(product.rawSafeData)
      ]
    );
    await client.query(
      `INSERT INTO application_status_history (application_id, previous_status, new_status, comment)
       VALUES ($1, NULL, 'new', 'Заявку створено з публічної форми')`,
      [applicationId]
    );
    recipients = await getApplicationRecipientIds(client);
    for (const userId of recipients) {
      await createNotification(client, {
        userId,
        applicationId,
        type: 'application_created',
        title: `Нова заявка №${applicationNumber}`,
        message: `${form.name}: ${product.title || cleanText(context.pageTitle || '', 120) || 'без назви товару'}`
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  publishApplicationUpdates(recipients, {
    type: 'created',
    applicationId,
    number: applicationNumber,
    status: 'new'
  });
  publishNotificationUpdates(recipients);
  publishChatUpdates(recipients, { type: 'entity', entityType: 'application', entityId: applicationId });
  const application = recipients[0]
    ? await loadApplicationView(applicationId, { id: recipients[0], role: 'admin' })
    : null;
  res.status(201).json({ data: {
    id: applicationId,
    number: applicationNumber,
    status: application?.status || 'new'
  } });
}));

export default router;
