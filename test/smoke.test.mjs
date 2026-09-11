// Drives the real page in headless Chrome: landing page, theme toggle,
// singleplayer flow, and the sign-in view. Multiplayer needs Firebase and is
// covered by test/rules.test.mjs.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { isConfigured } from "../js/config.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHROME = process.env.CHROME_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

let server;
let browser;
let page;
let origin;
const consoleErrors = [];

before(async () => {
  server = createServer(async (request, response) => {
    const path = normalize(decodeURI(request.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    const file = join(ROOT, path === "/" ? "index.html" : path);
    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": TYPES[extname(file)] || "text/plain" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage();
  page.on("console", (message) => {
    const url = message.location()?.url || "";
    if (message.type() === "error" && !/favicon/i.test(url)) consoleErrors.push(message.text() + " " + url);
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.theme));
});

after(async () => {
  await browser?.close();
  server?.close();
});

const text = (selector) => page.$eval(selector, (node) => node.textContent.trim());

test("the landing page centers the name and play actions with sign-in at the top", async () => {
  assert.equal(await page.title(), "dilemma");
  assert.equal(await text("h1"), "dilemma");
  const labels = await page.$$eval("#view-home button", (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.deepEqual(labels, ["Singleplayer", "Multiplayer"]);
  assert.equal(await text("#btn-auth"), "Sign in");
  const alignment = await page.$eval("h1", (node) => getComputedStyle(node).textAlign);
  assert.equal(alignment, "center");
  const homeAlignment = await page.$eval("#view-home", (node) => getComputedStyle(node).alignItems);
  assert.equal(homeAlignment, "center");
  const font = await page.$eval("body", (node) => getComputedStyle(node).fontFamily);
  assert.match(font, /Times New Roman/);
});

test("room creation settings use one clearly labeled row per option", async () => {
  const labels = await page.$$eval("#view-rooms .setting-row > label", (nodes) => nodes.map((node) => node.textContent.trim()));
  assert.deepEqual(labels, ["Number of rounds"]);
  assert.equal(await page.$eval("#create-rounds", (node) => node.value), "3");
  const layout = await page.$eval("#view-rooms .settings-panel", (node) => getComputedStyle(node).display);
  assert.equal(layout, "grid");
});

test("the dark mode toggle switches and persists", async () => {
  assert.equal(await page.$eval("html", (node) => node.dataset.theme), "light");
  await page.click("#theme-toggle");
  assert.equal(await page.$eval("html", (node) => node.dataset.theme), "dark");
  const background = await page.$eval("body", (node) => getComputedStyle(node).backgroundColor);
  assert.equal(background, "rgb(17, 17, 17)");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.theme));
  assert.equal(await page.$eval("html", (node) => node.dataset.theme), "dark");
  await page.click("#theme-toggle");
});

test("singleplayer shows global percentages after submitting and then moves on", async () => {
  const catalog = JSON.parse(await readFile(new URL("../dilemmas.json", import.meta.url), "utf8"));
  const texts = new Set(catalog.map((entry) => entry.text));

  await page.click("#btn-singleplayer");
  assert.equal(await page.$eval("#view-single", (node) => node.hidden), false);
  const first = await text("#single-dilemma");
  assert.ok(texts.has(first), "dilemma comes from the catalog");

  await page.click("#single-options input");
  await page.click("#single-form button");
  await page.waitForFunction(
    () => document.querySelector("#single-form button")?.textContent.trim() === "Next dilemma",
  );
  assert.equal(await text("#single-dilemma"), first);
  assert.equal(await page.$eval("#single-form button", (node) => node.textContent.trim()), "Next dilemma");
  const optionDetails = await page.$$eval("#single-options .choice-percentage", (nodes) => nodes.map((node) => node.textContent.trim()));
  assert.equal(optionDetails.length > 0, true);
  assert.equal(optionDetails.every((detail) => /%|—/.test(detail)), true);

  await page.click("#single-form button");
  const second = await text("#single-dilemma");
  assert.ok(texts.has(second));
  assert.notEqual(second, first);

  // Seen dilemmas are remembered privately for a signed-out player.
  const seen = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("moral-dilemma:history") || "{}")));
  assert.equal(seen.length, 2);
  const byId = new Map(catalog.map((entry) => [entry.id, entry.text]));
  assert.deepEqual(seen.map((id) => byId.get(id)), [first, second]);
});

test("singleplayer shows all choices from the catalog", async () => {
  const first = await text("#single-dilemma");
  const catalog = JSON.parse(await readFile(new URL("../dilemmas.json", import.meta.url), "utf8"));
  const entry = catalog.find((item) => item.text === first);
  const labels = await page.$$eval("#single-options label", (nodes) => nodes.map((node) => node.textContent.trim()));
  assert.deepEqual(labels, entry.options);
  assert.equal(await page.$eval("#single-options fieldset", (node) => node.className), "choice-list");
  await page.click("#single-options input");
  await page.click("#single-form button");
  await page.waitForFunction(
    () => document.querySelector("#single-form button")?.textContent.trim() === "Next dilemma",
  );
  await page.click("#single-form button");
  assert.notEqual(await text("#single-dilemma"), first);
});

test("the game exposes multiple-choice controls only", async () => {
  assert.equal((await page.$$("textarea")).length, 0);
  assert.equal(await page.$$eval("#single-options input[type=radio]", (nodes) => nodes.length > 1), true);
});

test("percentage visibility can be toggled and Home is available outside the landing page", async () => {
  await page.click("#stats-toggle");
  assert.equal(await text("#stats-toggle"), "Show percentages");
  await page.click("#stats-toggle");
  assert.equal(await text("#stats-toggle"), "Hide percentages");

  // The previous test left the singleplayer view open.
  await page.click("#view-single [data-back]");
  await page.click("#btn-singleplayer");
  assert.equal(await page.$eval("#home-button", (node) => node.hidden), false);
  await page.click("#home-button");
  assert.equal(await page.$eval("#view-home", (node) => node.hidden), false);
});

test("multiplayer offers an account or guest play, and the sign-in view is reachable", async () => {
  await page.click("#btn-rooms");
  if (isConfigured) {
    // Multiplayer asks how to play instead of showing a sign-in form or an
    // error telling the player to sign in first.
    assert.equal(await page.$eval("#view-choose", (node) => node.hidden), false);
    assert.equal(await page.$eval("#view-auth", (node) => node.hidden), true);
    assert.equal(await text("#auth-error"), "");
    const choices = await page.$$eval("#view-choose button:not(.back)", (nodes) => nodes.map((n) => n.textContent.trim()));
    assert.deepEqual(choices, ["Make an account", "Continue as guest"]);

    // Guest play asks for a username right away, with no sign-in form.
    await page.click("#btn-choose-guest");
    assert.equal(await page.$eval("#view-guest", (node) => node.hidden), false);
    assert.match(await page.$eval("#guest-name", (node) => node.placeholder), /Username/);
    assert.equal(await page.evaluate(() => document.activeElement.id), "guest-name");
    assert.equal((await page.$$("#view-guest input[type=password]")).length, 0);
    await page.click("#view-guest [data-back]");

    await page.click("#btn-rooms");
    await page.click("#btn-choose-account");
    assert.equal(await page.$eval("#view-auth", (node) => node.hidden), false);
    await page.click("#view-auth [data-back]");
  } else {
    // Placeholder config: the app says so plainly instead of pretending a room
    // can be created.
    assert.match(await text("#global-error"), /not configured/);
    assert.equal(await page.$eval("#view-home", (node) => node.hidden), false);
  }

  await page.click("#btn-auth");
  assert.equal(await page.$eval("#view-auth", (node) => node.hidden), false);
  assert.equal(await page.$eval("#auth-signed-out", (node) => node.hidden), false);
  assert.equal((await page.$$("#btn-guest")).length, 0);
  assert.match(await page.$eval("#auth-name", (node) => node.placeholder), /Username/);
  assert.equal(await page.$eval("#btn-email-link", (node) => node.textContent.trim()), "Email me a sign-in link");
  assert.equal(await page.$eval("#btn-email-complete", (node) => node.hidden), true);
  await page.click("#view-auth [data-back]");
  assert.equal(await page.$eval("#view-home", (node) => node.hidden), false);
});

test("the page runs without console errors", () => {
  assert.deepEqual(consoleErrors, []);
});
