import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, setDoc, getDoc, getDocs, updateDoc, collection, writeBatch, increment,
} from "firebase/firestore";

const CODE = "ABCD";
let env;
let alice; // host
let bob;   // second player

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-moral-dilemma",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  alice = env.authenticatedContext("alice").firestore();
  bob = env.authenticatedContext("bob").firestore();
});

const room = (db) => doc(db, "rooms", CODE);
const player = (db, uid) => doc(db, "rooms", CODE, "players", uid);
const round = (db, n) => doc(db, "rooms", CODE, "rounds", String(n));
const answer = (db, n, id) => doc(db, "rooms", CODE, "rounds", String(n), "answers", id);
const author = (db, n, uid) => doc(db, "rooms", CODE, "rounds", String(n), "authors", uid);
const submitted = (db, n, uid) => doc(db, "rooms", CODE, "rounds", String(n), "submitted", uid);
const vote = (db, n, uid) => doc(db, "rooms", CODE, "rounds", String(n), "votes", uid);

const newRoom = (overrides = {}) => ({
  hostUid: "alice", status: "lobby", totalRounds: 3, currentRound: 0,
  candidates: [], dilemmaIds: [], ...overrides,
});
const newPlayer = (name) => ({ name, score: 0, roundScores: {} });

async function seedRoom(overrides = {}, roundData = null) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(room(db), newRoom(overrides));
    await setDoc(player(db, "alice"), newPlayer("alice"));
    await setDoc(player(db, "bob"), newPlayer("bob"));
    if (roundData) await setDoc(round(db, 1), roundData);
  });
}

async function seedAnswer(uid, responseId, text) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(author(db, 1, uid), { responseId });
    await setDoc(answer(db, 1, responseId), { text });
    await setDoc(submitted(db, 1, uid), { at: new Date() });
  });
}

test("a signed-in player can create a room and be its host; nobody else can drive it", async () => {
  await assertSucceeds(setDoc(room(alice), newRoom()));
  await assertSucceeds(setDoc(player(alice, "alice"), newPlayer("alice")));
  // Claiming to host a room you do not own is refused.
  await assertFails(setDoc(doc(bob, "rooms", "ZZZZ"), newRoom({ hostUid: "alice" })));
});

test("another player joins by code but cannot touch anyone else's player document", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(room(context.firestore()), newRoom());
    await setDoc(player(context.firestore(), "alice"), newPlayer("alice"));
  });
  await assertSucceeds(getDoc(room(bob)));
  await assertSucceeds(setDoc(player(bob, "bob"), newPlayer("bob")));
  await assertFails(setDoc(player(bob, "carol"), newPlayer("carol")));
  await assertFails(updateDoc(player(bob, "alice"), { score: 99 }));
  await assertSucceeds(updateDoc(player(bob, "bob"), { score: 2 }));
});

test("only the host sets the round count, and it must be a positive number", async () => {
  await seedRoom();
  await assertSucceeds(updateDoc(room(alice), { totalRounds: 5 }));
  await assertFails(updateDoc(room(alice), { totalRounds: 0 }));
  await assertFails(updateDoc(room(bob), { totalRounds: 5 }));
  await assertFails(updateDoc(room(alice), { hostUid: "bob" }));
});

test("dilemma history is private to its owner", async () => {
  const entry = { dilemmaId: "wikipedia-0001", seenAt: new Date() };
  await assertSucceeds(setDoc(doc(alice, "users", "alice", "history", "wikipedia-0001"), entry));
  await assertFails(setDoc(doc(bob, "users", "alice", "history", "wikipedia-0002"), entry));
  await assertFails(getDoc(doc(bob, "users", "alice", "history", "wikipedia-0001")));
  await assertSucceeds(getDocs(collection(alice, "users", "alice", "history")));
});

test("players report only counts into the room's candidate pool", async () => {
  await seedRoom({ status: "selecting", candidates: ["a", "b"] });
  const pool = (db, id) => doc(db, "rooms", CODE, "pool", id);
  await assertSucceeds(setDoc(pool(alice, "a"), { count: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(pool(bob, "a"), { count: increment(1) }, { merge: true }));
  // Counts move one at a time, and cannot be stuffed.
  await assertFails(setDoc(pool(bob, "a"), { count: 99 }));
  // Counts are reported one write at a time; a batch would share one rule budget.
  await assertSucceeds(setDoc(doc(bob, "rooms", CODE, "pool", "b"), { count: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(doc(bob, "rooms", CODE, "contrib", "bob"), { at: new Date() }));
  await assertFails(setDoc(doc(bob, "rooms", CODE, "contrib", "alice"), { at: new Date() }));
});

test("responses stay unreadable until the answering phase is over", async () => {
  await seedRoom({ status: "playing", currentRound: 1 },
    { dilemmaId: "wikipedia-0001", dilemma: "text", phase: "answer", order: [] });

  const batch = writeBatch(alice);
  batch.set(author(alice, 1, "alice"), { responseId: "r-alice" });
  batch.set(answer(alice, 1, "r-alice"), { text: "mine" });
  batch.set(submitted(alice, 1, "alice"), { at: new Date() });
  await assertSucceeds(batch.commit());

  await assertFails(getDoc(answer(bob, 1, "r-alice")));
  await assertFails(getDocs(collection(bob, "rooms", CODE, "rounds", "1", "answers")));
  // The submission marker is public, so the host can count without reading text.
  await assertSucceeds(getDocs(collection(bob, "rooms", CODE, "rounds", "1", "submitted")));

  const second = writeBatch(alice);
  second.set(author(alice, 1, "alice"), { responseId: "r-alice-2" });
  second.set(answer(alice, 1, "r-alice-2"), { text: "again" });
  second.set(submitted(alice, 1, "alice"), { at: new Date() });
  await assertFails(second.commit()); // one response per player per round
});

test("response ownership is readable only by its author", async () => {
  await seedRoom({ status: "playing", currentRound: 1 },
    { dilemmaId: "wikipedia-0001", dilemma: "text", phase: "answer", order: [] });
  await seedAnswer("alice", "r-alice", "mine");
  await assertSucceeds(getDoc(author(alice, 1, "alice")));
  await assertFails(getDoc(author(bob, 1, "alice")));
  await assertFails(getDocs(collection(bob, "rooms", CODE, "rounds", "1", "authors")));
});

test("only the host reveals, and nobody can rewrite another player's response", async () => {
  await seedRoom({ status: "playing", currentRound: 1 },
    { dilemmaId: "wikipedia-0001", dilemma: "text", phase: "answer", order: [] });
  await seedAnswer("alice", "r-alice", "mine");
  await assertFails(updateDoc(answer(bob, 1, "r-alice"), { text: "tampered" }));
  await assertFails(updateDoc(round(bob, 1), { phase: "vote" }));
  await assertSucceeds(updateDoc(round(alice, 1), { phase: "reveal" }));
  await assertSucceeds(updateDoc(round(alice, 1), { phase: "vote", order: ["r-alice", "r-bob"] }));
  await assertSucceeds(getDoc(answer(bob, 1, "r-alice")));
});

test("one vote per player, and no self-voting", async () => {
  await seedRoom({ status: "playing", currentRound: 1 },
    { dilemmaId: "wikipedia-0001", dilemma: "text", phase: "vote", order: ["r-alice", "r-bob"] });
  await seedAnswer("alice", "r-alice", "mine");
  await seedAnswer("bob", "r-bob", "theirs");

  await assertFails(setDoc(vote(alice, 1, "alice"), { responseId: "r-alice" }));
  await assertSucceeds(setDoc(vote(alice, 1, "alice"), { responseId: "r-bob" }));
  await assertFails(setDoc(vote(alice, 1, "alice"), { responseId: "r-alice" })); // no changing it
  await assertFails(setDoc(vote(alice, 1, "bob"), { responseId: "r-alice" }));   // not your vote
  await assertSucceeds(setDoc(vote(bob, 1, "bob"), { responseId: "r-alice" }));

  const votes = await getDocs(collection(alice, "rooms", CODE, "rounds", "1", "votes"));
  assert.equal(votes.size, 2);
});
