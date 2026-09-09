import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pickSingleplayerQueue, pickCandidates, chooseDilemmaIds, unseen } from "../js/selection.js";

const CATALOG = JSON.parse(readFileSync(new URL("../dilemmas.json", import.meta.url), "utf8"));
const ids = CATALOG.map((entry) => entry.id);

test("the catalog has stable ids, text, and source metadata", () => {
  assert.ok(CATALOG.length > 0);
  assert.equal(new Set(ids).size, CATALOG.length);
  for (const entry of CATALOG) {
    assert.equal(typeof entry.id, "string");
    assert.ok(entry.text.length > 0);
    assert.ok(Array.isArray(entry.options));
    assert.ok(entry.options.length >= 2);
    assert.equal(new Set(entry.options).size, entry.options.length);
    assert.equal(typeof entry.source.url, "string");
  }
  const sourced = CATALOG.filter((entry) => entry.source && typeof entry.source.url === "string");
  assert.equal(sourced.length, CATALOG.length);
});

test("singleplayer skips dilemmas this user has already seen", () => {
  const history = new Map(ids.slice(0, 15).map((id, i) => [id, i]));
  const queue = pickSingleplayerQueue(ids, history, 25);
  assert.equal(queue.length, 25);
  assert.equal(queue.filter((id) => history.has(id)).length, 0);
});

test("when nearly everything has been seen, the least recently seen come back", () => {
  const small = ["a", "b", "c", "d"];
  const history = new Map([["a", 400], ["b", 100], ["c", 200], ["d", 300]]);
  assert.deepEqual(pickSingleplayerQueue(small, history, 3), ["b", "c", "d"]);
  // One unseen entry still leads.
  const partial = new Map([["a", 400], ["b", 100]]);
  const queue = pickSingleplayerQueue(small, partial, 3);
  assert.deepEqual(new Set(queue.slice(0, 2)), new Set(["c", "d"]));
  assert.equal(queue[2], "b");
  assert.deepEqual(unseen(small, partial).sort(), ["c", "d"]);
});

test("a room prefers candidates nobody has seen, then the fewest-seen", () => {
  const candidates = ["a", "b", "c", "d"];
  const counts = new Map([["a", 2], ["b", 0], ["c", 1]]); // d unseen by all
  const chosen = chooseDilemmaIds(candidates, counts, 3);
  assert.deepEqual(new Set(chosen.slice(0, 2)), new Set(["b", "d"]));
  assert.equal(chosen[2], "c");
});

test("repeat avoidance never blocks a game", () => {
  const candidates = ["a", "b"];
  const counts = new Map([["a", 3], ["b", 3]]); // everything seen by everyone
  const chosen = chooseDilemmaIds(candidates, counts, 5);
  assert.equal(chosen.length, 5);
  assert.deepEqual(new Set(chosen), new Set(["a", "b"]));
  assert.deepEqual(chooseDilemmaIds([], new Map(), 3), []);
});

test("candidate lists stay inside the catalog and never repeat", () => {
  const candidates = pickCandidates(ids, 20);
  assert.equal(candidates.length, 20);
  assert.equal(new Set(candidates).size, 20);
  assert.ok(candidates.every((id) => ids.includes(id)));
  assert.equal(pickCandidates(["a", "b"], 20).length, 2);
});
