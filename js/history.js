// Private per-user dilemma history: local storage while signed out, Firestore
// under users/{uid}/history once signed in. A history is never readable by
// anyone but its owner.
import { db, doc, collection, getDoc, getDocs, setDoc, serverTimestamp } from "./firebase.js";

const LOCAL_KEY = "moral-dilemma:history";
const historyRef = (uid, dilemmaId) => doc(db, "users", uid, "history", dilemmaId);

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { return {}; }
}
function writeLocal(entries) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(entries)); } catch {}
}

export function localHistory() {
  return new Map(Object.entries(readLocal()).map(([id, at]) => [id, Number(at) || 0]));
}

export function recordLocal(dilemmaId) {
  const entries = readLocal();
  if (entries[dilemmaId]) return;
  entries[dilemmaId] = Date.now();
  writeLocal(entries);
}

export async function loadRemote(uid) {
  const snap = await getDocs(collection(db, "users", uid, "history"));
  return new Map(snap.docs.map((d) => [d.id, d.data().seenAt?.toMillis?.() ?? 0]));
}

// Idempotent: the dilemma id is the document id, and an existing record is
// never rewritten, so reconnects cannot duplicate or reorder history.
export async function recordRemote(uid, dilemmaId, known) {
  if (known && known.has(dilemmaId)) return;
  const existing = await getDoc(historyRef(uid, dilemmaId));
  if (existing.exists()) return;
  await setDoc(historyRef(uid, dilemmaId), { dilemmaId, seenAt: serverTimestamp() });
}

// Fold a signed-out session's history into the account it just signed in to.
export async function mergeLocalInto(uid, known) {
  const local = localHistory();
  for (const [dilemmaId, seenAt] of local) {
    if (known.has(dilemmaId)) continue;
    await setDoc(historyRef(uid, dilemmaId), { dilemmaId, seenAt: new Date(seenAt) });
    known.set(dilemmaId, seenAt);
  }
  try { localStorage.removeItem(LOCAL_KEY); } catch {}
  return known;
}
