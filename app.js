"use strict";

const REQUIRED_HEADERS = [
  "householdno",
  "accountno",
  "name",
  "arrears",
  "current month bill",
  "total bill",
];
const PBKDF2_ITERATIONS = 600000;
const ENCRYPTED_FILE_NAME = "data.enc";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const elements = {
  notice: document.querySelector("#notice"),
  loginPanel: document.querySelector("#login-panel"),
  setupPanel: document.querySelector("#setup-panel"),
  portalPanel: document.querySelector("#portal-panel"),
  loginForm: document.querySelector("#login-form"),
  loginPassphrase: document.querySelector("#login-passphrase"),
  encryptedFile: document.querySelector("#encrypted-file"),
  setupForm: document.querySelector("#setup-form"),
  setupCsv: document.querySelector("#setup-csv"),
  setupPassphrase: document.querySelector("#setup-passphrase"),
  setupPassphraseConfirm: document.querySelector("#setup-passphrase-confirm"),
  lockButton: document.querySelector("#lock-button"),
  recordCount: document.querySelector("#record-count"),
  searchForm: document.querySelector("#search-form"),
  householdInput: document.querySelector("#household-input"),
  results: document.querySelector("#results"),
  updateButton: document.querySelector("#update-button"),
  updatePanel: document.querySelector("#update-panel"),
  cancelUpdate: document.querySelector("#cancel-update"),
  updateForm: document.querySelector("#update-form"),
  updateCsv: document.querySelector("#update-csv"),
};

const state = {
  records: [],
  passphrase: null,
};

function showNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle("error", isError);
  elements.notice.classList.remove("hidden");
}

function clearNotice() {
  elements.notice.textContent = "";
  elements.notice.classList.add("hidden");
  elements.notice.classList.remove("error");
}

function showPanel(panel) {
  elements.loginPanel.classList.toggle("hidden", panel !== "login");
  elements.setupPanel.classList.toggle("hidden", panel !== "setup");
  elements.portalPanel.classList.toggle("hidden", panel !== "portal");
  elements.lockButton.classList.toggle("hidden", panel !== "portal");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (inQuotes || field.length === 0) {
        inQuotes = !inQuotes;
      } else {
        throw new Error("The CSV contains a quote in an invalid position.");
      }
    } else if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("The CSV has an unclosed quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function recordsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error("The CSV has no bill records.");
  }

  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase());
  const columnIndexes = REQUIRED_HEADERS.map((header) => headers.indexOf(header));
  const missingHeaders = REQUIRED_HEADERS.filter((header, index) => columnIndexes[index] === -1);
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required CSV columns: ${missingHeaders.join(", ")}.`);
  }

  const records = [];
  let skipped = 0;
  for (const cells of rows.slice(1)) {
    if (cells.every((cell) => cell.trim() === "")) {
      continue;
    }

    if (cells.length < headers.length) {
      skipped += 1;
      continue;
    }

    const values = columnIndexes.map((columnIndex) => cells[columnIndex].trim());
    if (!values[0]) {
      skipped += 1;
      continue;
    }

    records.push({
      householdNo: values[0],
      accountNo: values[1],
      name: values[2],
      arrears: values[3],
      currentMonthBill: values[4],
      totalBill: values[5],
    });
  }

  if (records.length === 0) {
    throw new Error("No records with a household number were found.");
  }

  return { records, skipped };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveEncryptionKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptRecords(records, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt);
  const plaintext = encoder.encode(JSON.stringify({
    exportedAt: new Date().toISOString(),
    records,
  }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    format: "household-bill-lookup",
    version: 1,
    kdf: "PBKDF2-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptBundle(bundle, passphrase) {
  if (
    bundle.format !== "household-bill-lookup"
    || bundle.version !== 1
    || bundle.kdf !== "PBKDF2-SHA-256"
    || bundle.cipher !== "AES-256-GCM"
    || bundle.iterations !== PBKDF2_ITERATIONS
    || typeof bundle.salt !== "string"
    || typeof bundle.iv !== "string"
    || typeof bundle.ciphertext !== "string"
  ) {
    throw new Error("This is not a supported encrypted bill file.");
  }

  const salt = base64ToBytes(bundle.salt);
  const iv = base64ToBytes(bundle.iv);
  const ciphertext = base64ToBytes(bundle.ciphertext);
  const key = await deriveEncryptionKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const payload = JSON.parse(decoder.decode(plaintext));
  if (!Array.isArray(payload.records)) {
    throw new Error("The encrypted file does not contain a valid record list.");
  }
  return payload.records;
}

function downloadEncryptedBundle(bundle) {
  const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = ENCRYPTED_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatAmount(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "—";
  }

  const isParenthesized = /^\(.*\)$/.test(raw);
  const normalized = raw
    .replace(/[,\s]/g, "")
    .replace(/^(PKR|Rs\.?|₨)/i, "")
    .replace(/[₨]/g, "");
  const amount = Number(normalized.replace(/^\((.*)\)$/, "-$1"));
  if (!Number.isFinite(amount)) {
    return raw;
  }
  const formatted = new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(isParenthesized ? -Math.abs(amount) : amount);
  return `Rs ${formatted}`;
}

function appendDetail(container, label, value, isTotal = false) {
  const wrapper = document.createElement("div");
  wrapper.className = isTotal ? "detail detail-total" : "detail";
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value || "—";
  wrapper.append(term, description);
  container.append(wrapper);
}

function renderResults(matches, householdNo) {
  elements.results.replaceChildren();

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = `No record found for household number ${householdNo}. Check the number and try again.`;
    elements.results.append(empty);
    return;
  }

  for (const record of matches) {
    const card = document.createElement("article");
    card.className = "record-card";

    const heading = document.createElement("div");
    heading.className = "record-heading";
    const name = document.createElement("h3");
    name.textContent = record.name || "Name not provided";
    const account = document.createElement("span");
    account.className = "record-number";
    account.textContent = `Consumer no. ${record.accountNo || "—"}`;
    heading.append(name, account);

    const details = document.createElement("dl");
    details.className = "details-grid";
    appendDetail(details, "Household number", record.householdNo);
    appendDetail(details, "Consumer number", record.accountNo);
    appendDetail(details, "Arrears", formatAmount(record.arrears));
    appendDetail(details, "Current month bill", formatAmount(record.currentMonthBill));
    appendDetail(details, "Total amount", formatAmount(record.totalBill), true);

    card.append(heading, details);
    elements.results.append(card);
  }
}

function updateRecordCount() {
  const count = new Intl.NumberFormat("en").format(state.records.length);
  elements.recordCount.textContent = `${count} household record${state.records.length === 1 ? "" : "s"} loaded`;
}

function setBusy(form, busy, buttonText) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) {
    return;
  }
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = buttonText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

async function readBundleFile(file) {
  let bundle;
  try {
    bundle = JSON.parse(await file.text());
  } catch {
    throw new Error("The selected encrypted data file is not valid JSON.");
  }
  return bundle;
}

async function unlockWithFile(file, passphrase) {
  const bundle = await readBundleFile(file);
  const records = await decryptBundle(bundle, passphrase);
  if (records.length === 0) {
    throw new Error("The encrypted file contains no bill records.");
  }
  state.records = records;
  state.passphrase = passphrase;
  showPanel("portal");
  updateRecordCount();
  clearNotice();
}

async function loadHostedBundle() {
  if (location.protocol === "file:") {
    showPanel("setup");
    return;
  }

  try {
    const response = await fetch(new URL(ENCRYPTED_FILE_NAME, location.href), { cache: "no-store" });
    if (!response.ok) {
      showPanel("setup");
      return;
    }
    await response.json();
    showPanel("login");
  } catch {
    showPanel("setup");
    showNotice("Could not load data.enc. If this portal is already set up, check the website and encrypted data file.", true);
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();
  const submitButton = elements.loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const passphrase = elements.loginPassphrase.value;
    if (elements.encryptedFile.files[0]) {
      await unlockWithFile(elements.encryptedFile.files[0], passphrase);
    } else {
      const response = await fetch(new URL(ENCRYPTED_FILE_NAME, location.href), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("The encrypted bill file could not be loaded. Choose data.enc or contact the portal administrator.");
      }
      const records = await decryptBundle(await response.json(), passphrase);
      if (records.length === 0) {
        throw new Error("The encrypted file contains no bill records.");
      }
      state.records = records;
      state.passphrase = passphrase;
      showPanel("portal");
      updateRecordCount();
    }
    elements.loginPassphrase.value = "";
    elements.encryptedFile.value = "";
    clearNotice();
  } catch (error) {
    const message = error.name === "OperationError"
      ? "The passphrase is incorrect or the encrypted file is damaged. Try again or choose the correct data.enc."
      : error.message;
    showNotice(message, true);
  } finally {
    submitButton.disabled = false;
  }
});

elements.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();
  const passphrase = elements.setupPassphrase.value;
  if (passphrase.length < 16) {
    showNotice("Create a passphrase with at least 16 characters.", true);
    return;
  }
  if (passphrase !== elements.setupPassphraseConfirm.value) {
    showNotice("The passphrases do not match.", true);
    return;
  }

  setBusy(elements.setupForm, true, "Encrypting bill file…");
  try {
    const file = elements.setupCsv.files[0];
    if (!file) {
      throw new Error("Select the monthly CSV file first.");
    }
    const { records, skipped } = recordsFromCsv(await file.text());
    const bundle = await encryptRecords(records, passphrase);
    downloadEncryptedBundle(bundle);
    state.records = records;
    state.passphrase = passphrase;
    elements.setupPassphrase.value = "";
    elements.setupPassphraseConfirm.value = "";
    showPanel("portal");
    updateRecordCount();
    showNotice(`Encrypted ${records.length.toLocaleString("en")} records and downloaded data.enc. Publish that file beside the portal to make it available to the team.${skipped ? ` Skipped ${skipped.toLocaleString("en")} incomplete row(s).` : ""}`);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    setBusy(elements.setupForm, false);
  }
});

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const householdNo = elements.householdInput.value.trim();
  if (!householdNo) {
    return;
  }
  const matches = state.records.filter((record) => record.householdNo.trim() === householdNo);
  renderResults(matches, householdNo);
});

elements.updateButton.addEventListener("click", () => {
  elements.updatePanel.classList.remove("hidden");
  elements.updateCsv.focus();
});

elements.cancelUpdate.addEventListener("click", () => {
  elements.updatePanel.classList.add("hidden");
  elements.updateForm.reset();
  clearNotice();
});

elements.updateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();
  setBusy(elements.updateForm, true, "Encrypting new file…");
  try {
    const file = elements.updateCsv.files[0];
    if (!file) {
      throw new Error("Select the new monthly CSV file first.");
    }
    const { records, skipped } = recordsFromCsv(await file.text());
    const bundle = await encryptRecords(records, state.passphrase);
    downloadEncryptedBundle(bundle);
    state.records = records;
    updateRecordCount();
    elements.results.replaceChildren();
    elements.householdInput.value = "";
    elements.updateForm.reset();
    elements.updatePanel.classList.add("hidden");
    showNotice(`Encrypted ${records.length.toLocaleString("en")} records and downloaded a replacement data.enc. Replace the old file on your website to publish this month's data.${skipped ? ` Skipped ${skipped.toLocaleString("en")} incomplete row(s).` : ""}`);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    setBusy(elements.updateForm, false);
  }
});

elements.encryptedFile.addEventListener("change", () => {
  if (elements.encryptedFile.files.length > 0) {
    elements.loginPassphrase.focus();
  }
});

elements.lockButton.addEventListener("click", () => {
  state.records = [];
  state.passphrase = null;
  elements.results.replaceChildren();
  elements.householdInput.value = "";
  elements.loginForm.reset();
  elements.updatePanel.classList.add("hidden");
  clearNotice();
  showPanel("login");
});

if (!globalThis.crypto?.subtle) {
  showPanel("setup");
  showNotice("This browser does not support secure encryption here. Open the hosted HTTPS portal in an up-to-date browser.", true);
} else {
  loadHostedBundle();
}
