// Generates js/config.js from .env, because a static page cannot read .env
// itself. Run via `npm run config` (npm start and npm test run it for you).
//
// These values are not secrets — Firebase web config is public by design and is
// visible in any browser that loads the page. Keeping them in .env just keeps
// one project's ids out of the repository. The security boundary is
// firestore.rules.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url);
const ENV = fileURLToPath(new URL(".env", ROOT));
const OUT = fileURLToPath(new URL("js/config.js", ROOT));

const KEYS = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_AUTH_DOMAIN",
  projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID",
  appId: "FIREBASE_APP_ID",
};

const PLACEHOLDERS = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at === -1) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (/^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const env = existsSync(ENV) ? parseEnv(readFileSync(ENV, "utf8")) : {};
const config = {};
const missing = [];
for (const [field, key] of Object.entries(KEYS)) {
  const value = env[key];
  if (value && !value.startsWith("YOUR_")) config[field] = value;
  else {
    config[field] = PLACEHOLDERS[field];
    missing.push(key);
  }
}

const body = Object.entries(config)
  .map(([field, value]) => `  ${field}: ${JSON.stringify(value)},`)
  .join("\n");

writeFileSync(OUT, `// Generated from .env by tools/write-config.mjs — do not edit by hand.
// Run \`npm run config\` after changing .env.
export const firebaseConfig = {
${body}
};

export const isConfigured = !String(firebaseConfig.apiKey).startsWith("YOUR_");
`);

if (missing.length === Object.keys(KEYS).length) {
  console.log("js/config.js written with placeholders — copy .env.example to .env and fill it in.");
} else if (missing.length) {
  console.log("js/config.js written; still missing in .env: " + missing.join(", "));
} else {
  console.log("js/config.js written from .env (" + config.projectId + ").");
}
