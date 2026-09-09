// All Firestore reads/writes for multiplayer live here.
import {
  db, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, writeBatch, runTransaction, increment,
} from "./firebase.js";
import { textFor } from "./catalog.js";
import { pickCandidates, chooseDilemmaIds, shuffle } from "./selection.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const roomRef = (code) => doc(db, "rooms", code);
export const playersRef = (code) => collection(db, "rooms", code, "players");
export const playerRef = (code, uid) => doc(db, "rooms", code, "players", uid);
export const roundRef = (code, n) => doc(db, "rooms", code, "rounds", String(n));
const sub = (code, n, name) => collection(db, "rooms", code, "rounds", String(n), name);
export const answersRef = (code, n) => sub(code, n, "answers");
export const votesRef = (code, n) => sub(code, n, "votes");
export const submittedRef = (code, n) => sub(code, n, "submitted");
const authorRef = (code, n, uid) => doc(db, "rooms", code, "rounds", String(n), "authors", uid);
export const poolRef = (code) => collection(db, "rooms", code, "pool");
export const contribRef = (code) => collection(db, "rooms", code, "contrib");

export function playerName(user) {
  return user.displayName || (user.email || "player").split("@")[0];
}

export async function createRoom(user) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const existing = await getDoc(roomRef(code));
    if (existing.exists()) continue;
    await setDoc(roomRef(code), {
      hostUid: user.uid,
      status: "lobby",
      totalRounds: 3,
      currentRound: 0,
      candidates: [],
      dilemmaIds: [],
      createdAt: serverTimestamp(),
    });
    await addPlayer(code, user);
    return code;
  }
  throw new Error("Could not create a room. Try again.");
}

export async function addPlayer(code, user) {
  await setDoc(playerRef(code, user.uid), {
    name: playerName(user),
    score: 0,
    roundScores: {},
    joinedAt: serverTimestamp(),
  });
}

export async function joinRoom(code, user) {
  const snap = await getDoc(roomRef(code));
  if (!snap.exists()) throw new Error("No room with that code.");
  if (snap.data().status !== "lobby") throw new Error("That room has already started.");
  await addPlayer(code, user);
}

export async function leaveRoom(code, uid) {
  await deleteDoc(playerRef(code, uid));
}

export async function setTotalRounds(code, totalRounds) {
  await updateDoc(roomRef(code), { totalRounds });
}

function startRound(code, room, n) {
  const dilemmaId = room.dilemmaIds[n - 1];
  return setDoc(roundRef(code, n), {
    dilemmaId,
    dilemma: textFor(dilemmaId),
    phase: "answer",
    order: [],
  });
}

// Step one of starting: publish a candidate list the players can rate against
// their own history without revealing it.
export async function proposeSelection(code, totalRounds, catalogIds) {
  const size = Math.max(20, totalRounds * 4);
  await updateDoc(roomRef(code), {
    status: "selecting",
    totalRounds,
    candidates: pickCandidates(catalogIds, size),
    dilemmaIds: [],
  });
}

// Step two: each player privately marks which candidates they have seen. Only
// the counts are shared, never who has seen what.
export async function contribute(code, uid, candidates, history) {
  // One write per count rather than a batch: every write costs two rule lookups,
  // and a batch shares one budget for all of them.
  const seen = candidates.filter((id) => history.has(id));
  await Promise.all(seen.map((id) => setDoc(doc(poolRef(code), id), { count: increment(1) }, { merge: true })));
  // Written last, so a failure above is retried rather than silently skipped.
  await setDoc(doc(contribRef(code), uid), { at: serverTimestamp() });
}

// Step three: the host picks the least-seen candidates and starts round one.
export async function finalizeSelection(code, room) {
  const snap = await getDocs(poolRef(code));
  const counts = new Map(snap.docs.map((d) => [d.id, d.data().count || 0]));
  const dilemmaIds = chooseDilemmaIds(room.candidates || [], counts, room.totalRounds);
  const started = { ...room, dilemmaIds };
  await updateDoc(roomRef(code), { dilemmaIds });
  await startRound(code, started, 1);
  await updateDoc(roomRef(code), { status: "playing", currentRound: 1 });
}

export async function nextRound(code, room) {
  const next = room.currentRound + 1;
  if (next > room.totalRounds) {
    await updateDoc(roomRef(code), { status: "finished" });
    return;
  }
  await startRound(code, room, next);
  await updateDoc(roomRef(code), { currentRound: next });
}

// The author document maps a player to their response id. It is readable only
// by that player, so nobody else can connect a player to an answer.
export async function myResponseId(code, n, uid) {
  const snap = await getDoc(authorRef(code, n, uid));
  return snap.exists() ? snap.data().responseId : null;
}

export async function submitAnswer(code, n, uid, text) {
  const existing = await myResponseId(code, n, uid);
  if (existing) return existing;
  const responseId = randomId();
  const batch = writeBatch(db);
  batch.set(authorRef(code, n, uid), { responseId });
  batch.set(doc(answersRef(code, n), responseId), { text });
  batch.set(doc(submittedRef(code, n), uid), { at: serverTimestamp() });
  await batch.commit();
  return responseId;
}

export async function castVote(code, n, uid, responseId) {
  await setDoc(doc(votesRef(code, n), uid), { responseId });
}

// Two steps: close answering first, because answers stay unreadable — for the
// host too — while the round is still in the "answer" phase.
export async function closeAnswering(code, n) {
  await updateDoc(roundRef(code, n), { phase: "reveal" });
}

export async function revealAnswers(code, n) {
  const snap = await getDocs(answersRef(code, n));
  await updateDoc(roundRef(code, n), { order: shuffle(snap.docs.map((d) => d.id)), phase: "vote" });
}

export async function showResults(code, n) {
  await updateDoc(roundRef(code, n), { phase: "results" });
}

// Each player writes only their own score, for their own answer.
export async function recordScore(code, uid, roundNumber, points) {
  await runTransaction(db, async (tx) => {
    const ref = playerRef(code, uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const roundScores = { ...(snap.data().roundScores || {}), [roundNumber]: points };
    const score = Object.values(roundScores).reduce((sum, value) => sum + value, 0);
    tx.update(ref, { roundScores, score });
  });
}

export { onSnapshot };
