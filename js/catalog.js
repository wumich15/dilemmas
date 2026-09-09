// The replaceable dilemma catalog. Entries: { id, text, options, source }.
let entries = [];
let loadError = null;

try {
  const response = await fetch(new URL("../dilemmas.json", import.meta.url));
  if (!response.ok) throw new Error("dilemmas.json returned " + response.status);
  entries = await response.json();
} catch (error) {
  loadError = error;
}

export const CATALOG = entries;
export const catalogError = loadError;
export const catalogIds = entries.map((entry) => entry.id);
const byId = new Map(entries.map((entry) => [entry.id, entry]));

export const entryFor = (id) => byId.get(id) || null;
export const textFor = (id) => byId.get(id)?.text || "";
export const optionsFor = (id) => byId.get(id)?.options || [];
export const sourceFor = (id) => byId.get(id)?.source || null;
