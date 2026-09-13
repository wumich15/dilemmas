import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, increment,
} from "firebase/firestore";

const CODE = "ABCD";
let env;
let alice;
let bob;

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
const submitted = (db, n, uid) => doc(db, "rooms", CODE, "rounds", String(n), "submitted", uid);
const choice = (db, n, uid) => doc(db, "rooms", CODE, "rounds", String(n), "choices", uid);
const vote = (db, n, uid) => doc(db, "rooms", CODE, "rounds", String(n), "votes", uid);
const globalStats = (db, dilemmaId) => doc(db, "globalStats", dilemmaId);

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

test("a signed-in player can create a room and be its host; nobody else can drive it", async () => {
  await assertSucceeds(setDoc(room(alice), newRoom()));
  await assertSucceeds(setDoc(player(alice, "alice"), newPlayer("alice")));
  await assertFails(setDoc(doc(bob, "rooms", "ZZZZ"), newRoom({ hostUid: "alice" })));
});

test("another player joins by code but cannot touch anyone else's player document", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(room(db), newRoom());
    await setDoc(player(db, "alice"), newPlayer("alice"));
  });
  await assertSucceeds(getDoc(room(bob)));
  await assertSucceeds(setDoc(player(bob, "bob"), newPlayer("bob")));
  await assertFails(setDoc(player(bob, "carol"), newPlayer("carol")));
  await assertFails(updateDoc(player(bob, "alice"), { score: 99 }));
  await assertSucceeds(updateDoc(player(bob, "bob"), { score: 2 }));
});

test("a player may check their own seat before taking one", async () => {
  // addPlayer reads its own document first so rejoining cannot reset a score.
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(room(context.firestore()), newRoom());
  });
  await assertSucceeds(getDoc(player(bob, "bob")));
  await assertFails(getDoc(player(bob, "alice")));
});

test("a player cannot join a room that has already started", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(room(context.firestore()), newRoom({ status: "playing", currentRound: 1 }));
  });
  await assertFails(setDoc(player(bob, "bob"), newPlayer("bob")));
});

test("a player cannot seat themselves in a room that does not exist", async () => {
  await assertFails(setDoc(doc(bob, "rooms", "ZZZZ", "players", "bob"), newPlayer("bob")));
});

test("the room roster is readable only from inside the room", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(room(db), newRoom());
    await setDoc(player(db, "alice"), newPlayer("alice"));
  });
  await assertFails(getDocs(collection(bob, "rooms", CODE, "players")));
  await assertSucceeds(getDocs(collection(alice, "rooms", CODE, "players")));
});

test("a player cannot award themselves more than one point per round", async () => {
  await seedRoom();
  await assertSucceeds(updateDoc(player(bob, "bob"), { roundScores: { 1: 1 }, score: 1 }));
  await assertFails(updateDoc(player(bob, "bob"), { roundScores: { 1: 1, 2: 5 }, score: 6 }));
  await assertFails(updateDoc(player(bob, "bob"), { score: 99 }));
  // Four rounds of points in a three-round game.
  await assertFails(updateDoc(player(bob, "bob"), {
    roundScores: { 1: 1, 2: 1, 3: 1, 4: 1 }, score: 4,
  }));
  // A round already recorded cannot be dropped, and a name cannot be changed.
  await assertFails(updateDoc(player(bob, "bob"), { roundScores: {}, score: 1 }));
  await assertFails(updateDoc(player(bob, "bob"), { name: "alice" }));
});

test("hosting passes to a remaining player once the host has left", async () => {
  await seedRoom({ status: "playing", currentRound: 1 });
  // While the host is still seated, nobody may take the room from them.
  await assertFails(updateDoc(room(bob), { hostUid: "bob" }));
  await env.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(player(context.firestore(), "alice"));
  });
  await assertFails(updateDoc(room(bob), { hostUid: "bob", totalRounds: 9 }));
  await assertSucceeds(updateDoc(room(bob), { hostUid: "bob" }));
});

test("the host may clear a seat that has been abandoned", async () => {
  await seedRoom({ status: "playing", currentRound: 1 });
  await assertFails(deleteDoc(player(bob, "alice")));
  await assertSucceeds(deleteDoc(player(alice, "bob")));
});

test("guest numbers are only handed out while a room is in its lobby", async () => {
  const counter = (db) => doc(db, "rooms", CODE, "guestNames", "counter");
  await seedRoom();
  await assertSucceeds(setDoc(counter(bob), { next: 2 }));
  await assertSucceeds(updateDoc(counter(bob), { next: 3 }));
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(room(context.firestore()), { status: "playing" });
  });
  await assertFails(updateDoc(counter(bob), { next: 4 }));
});

test("only the host sets the round count, and it must be positive", async () => {
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

test("global stats allow one new response at a time", async () => {
  const first = {
    total: 1, optionCount: 3,
    option0: 1, option1: 0, option2: 0, option3: 0, option4: 0, option5: 0,
  };
  await assertSucceeds(setDoc(globalStats(alice, "wikipedia-0001"), first));
  await assertSucceeds(updateDoc(globalStats(alice, "wikipedia-0001"), {
    total: 2, option1: 1,
  }));
  await assertFails(updateDoc(globalStats(alice, "wikipedia-0001"), {
    total: 4, option0: 2, option1: 2,
  }));
  await assertFails(updateDoc(globalStats(alice, "wikipedia-0001"), {
    total: 3, option0: 0, option1: 2,
  }));
});

test("a global stats document missing option keys can still take a response", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(globalStats(context.firestore(), "legacy-0001"), { total: 4, option0: 4 });
  });
  await assertSucceeds(updateDoc(globalStats(alice, "legacy-0001"), {
    total: 5, optionCount: 3,
    option0: 4, option1: 1, option2: 0, option3: 0, option4: 0, option5: 0,
  }));
});

test("players report only counts into the room's candidate pool", async () => {
  await seedRoom({ status: "selecting", candidates: ["a", "b"] });
  const pool = (db, id) => doc(db, "rooms", CODE, "pool", id);
  await assertSucceeds(setDoc(pool(alice, "a"), { count: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(pool(bob, "a"), { count: increment(1) }, { merge: true }));
  await assertFails(setDoc(pool(bob, "a"), { count: 99 }));
  await assertSucceeds(setDoc(doc(bob, "rooms", CODE, "pool", "b"), { count: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(doc(bob, "rooms", CODE, "contrib", "bob"), { at: new Date() }));
  await assertFails(setDoc(doc(bob, "rooms", CODE, "contrib", "alice"), { at: new Date() }));
});

test("multiple-choice selections stay private until results", async () => {
  await seedRoom({ status: "playing", currentRound: 1 },
    { dilemmaId: "wikipedia-0001", dilemma: "text", options: ["one", "two", "three"], phase: "answer", order: [] });

  const batch = writeBatch(alice);
  batch.set(choice(alice, 1, "alice"), { optionIndex: 1 });
  batch.set(submitted(alice, 1, "alice"), { at: new Date() });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(choice(alice, 1, "alice")));
  await assertFails(getDoc(choice(bob, 1, "alice")));
  await assertFails(getDocs(collection(bob, "rooms", CODE, "rounds", "1", "choices")));
  await assertSucceeds(getDocs(collection(bob, "rooms", CODE, "rounds", "1", "submitted")));
  await assertSucceeds(updateDoc(round(alice, 1), { phase: "results" }));
  await assertSucceeds(getDoc(choice(bob, 1, "alice")));
  // Results make the whole collection listenable, which is what the round view
  // subscribes to once the server has confirmed the phase change.
  await assertSucceeds(getDocs(collection(bob, "rooms", CODE, "rounds", "1", "choices")));
  await assertFails(setDoc(choice(bob, 1, "bob"), { optionIndex: 0 }));
});

test("choice submissions are one-time and standalone votes are not allowed", async () => {
  await seedRoom({ status: "playing", currentRound: 1 },
    { dilemmaId: "wikipedia-0001", dilemma: "text", options: ["one", "two"], phase: "answer", order: [] });
  await assertSucceeds(setDoc(choice(alice, 1, "alice"), { optionIndex: 0 }));
  await assertSucceeds(setDoc(submitted(alice, 1, "alice"), { at: new Date() }));
  await assertFails(setDoc(choice(alice, 1, "alice"), { optionIndex: 1 }));
  await assertFails(setDoc(vote(alice, 1, "alice"), { responseId: "anything" }));
});
