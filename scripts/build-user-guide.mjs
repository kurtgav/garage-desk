// Builds the user guide PDF from docs/user-guide/guide.html, with the staff accounts from CREDENTIALS.local.md.
// Usage (repo root):
//   node scripts/build-user-guide.mjs            -> userguide.pdf (real passwords; gitignored, never commit)
//   node scripts/build-user-guide.mjs --redact   -> userguide-preview.pdf (passwords shown as dots)
// Prints only "wrote <file> (<n> pages)". Never prints, logs or writes a password anywhere except into the PDF.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("@playwright/test");

const redact = process.argv.includes("--redact");
const out = redact ? "userguide-preview.pdf" : "userguide.pdf";
const source = resolve("docs/user-guide/guide.html");

// The output holds passwords (or at least names and emails): refuse to write it unless git ignores it.
try {
  execFileSync("git", ["check-ignore", "-q", out]);
} catch {
  throw new Error(`${out} is not gitignored; refusing to write it`);
}

// | Name | owner|mechanic | email | `password` |
const md = readFileSync("CREDENTIALS.local.md", "utf8");
const rows = [...md.matchAll(/^\|\s*([^|]+?)\s*\|\s*(owner|mechanic)\s*\|\s*([^|\s]+@[^|\s]+)\s*\|\s*`([^`]+)`\s*\|/gm)].map((m) => ({
  name: m[1],
  role: m[2],
  email: m[3],
  password: m[4],
}));
const owners = rows.filter((r) => r.role === "owner");
const mechanics = rows.filter((r) => r.role === "mechanic");
if (rows.length !== 4 || owners.length !== 1 || mechanics.length !== 3) {
  throw new Error(
    `CREDENTIALS.local.md must list exactly 4 accounts (1 owner, 3 mechanics); found ${owners.length} owner(s), ${mechanics.length} mechanic(s)`,
  );
}
const values = {};
for (const [prefix, r] of [["OWNER", owners[0]], ...mechanics.map((m, i) => [`MECHANIC_${i + 1}`, m])]) {
  values[`${prefix}_NAME`] = r.name;
  values[`${prefix}_EMAIL`] = r.email;
  values[`${prefix}_PASSWORD`] = redact ? "••••••••" : r.password;
}

const PDF = { format: "A4", printBackground: true, preferCSSPageSize: true, outline: true, tagged: true };
const pageCount = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });

  // Fill the {{KEY}} placeholders in text nodes (in memory only; guide.html is never rewritten).
  const missing = await page.evaluate((vals) => {
    const left = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      n.nodeValue = n.nodeValue.replace(/\{\{([A-Z0-9_]+)\}\}/g, (all, key) => (key in vals ? vals[key] : (left.add(key), all)));
    }
    return [...left];
  }, values);
  if (missing.length) throw new Error(`unknown placeholders in guide.html: ${missing.join(", ")}`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  });
  const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")));
  if (broken.length) throw new Error(`missing images: ${broken.join(", ")}`);

  // Contents page numbers: every top-level section starts on a new page, so print each one alone,
  // count its pages, and add them up. Chromium has no target-counter(), hence this two-pass approach.
  const ids = await page.evaluate(() => [...document.querySelectorAll("body > section")].map((s) => s.id));
  const start = {};
  let next = 1;
  for (const id of ids) {
    start[id] = next;
    const style = await page.addStyleTag({
      content: `body > section:not(#${id}) { display: none !important; } #${id} { break-before: auto !important; }`,
    });
    next += pageCount(await page.pdf(PDF));
    await style.evaluate((el) => el.remove());
  }
  await page.evaluate((map) => {
    for (const el of document.querySelectorAll("[data-page-for]")) el.textContent = String(map[el.dataset.pageFor] ?? "");
  }, start);

  const pdf = await page.pdf(PDF);
  const pages = pageCount(pdf);
  if (pages !== next - 1) throw new Error(`page count check failed: ${pages} pages, sections add up to ${next - 1}`);
  writeFileSync(out, pdf);
  console.log(`wrote ${out} (${pages} pages)`);
} finally {
  await browser.close();
}
