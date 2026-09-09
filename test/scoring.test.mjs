import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreRound, pointsFor, pointsTable } from "../js/scoring.js";

const votes = (spec) => spec.flatMap(([id, n]) => Array.from({ length: n }, () => ({ responseId: id })));

test("points table depends on player count", () => {
  assert.deepEqual(pointsTable(2), [2, 1, 0]);
  assert.deepEqual(pointsTable(4), [2, 1, 0]);
  assert.deepEqual(pointsTable(5), [3, 2, 1]);
  assert.deepEqual(pointsTable(9), [3, 2, 1]);
});

test("2-4 players: 2/1/0", () => {
  const scores = scoreRound(votes([["a", 2], ["b", 1]]), 4);
  assert.equal(scores.get("a"), 2);
  assert.equal(scores.get("b"), 1);
});

test("5+ players: 3/2/1", () => {
  const scores = scoreRound(votes([["a", 3], ["b", 2], ["c", 1]]), 5);
  assert.equal(scores.get("a"), 3);
  assert.equal(scores.get("b"), 2);
  assert.equal(scores.get("c"), 1);
});

test("a tie for first takes first and second, so the next answer is third", () => {
  const small = scoreRound(votes([["a", 2], ["b", 2], ["c", 1]]), 4);
  assert.equal(small.get("a"), 2);
  assert.equal(small.get("b"), 2);
  assert.equal(small.get("c"), 0); // third place in a 2/1/0 room

  const big = scoreRound(votes([["a", 2], ["b", 2], ["c", 1]]), 6);
  assert.equal(big.get("a"), 3);
  assert.equal(big.get("b"), 3);
  assert.equal(big.get("c"), 1); // third place in a 3/2/1 room
});

test("a tie for second skips third", () => {
  const scores = scoreRound(votes([["a", 3], ["b", 1], ["c", 1], ["d", 0]]), 6);
  assert.equal(scores.get("a"), 3);
  assert.equal(scores.get("b"), 2);
  assert.equal(scores.get("c"), 2);
  assert.equal(scores.get("d"), undefined);
});

test("answers with no votes and answers past third place score nothing", () => {
  const cast = votes([["a", 4], ["b", 3], ["c", 2], ["d", 1]]);
  assert.equal(pointsFor("d", cast, 6), 0);
  assert.equal(pointsFor("e", cast, 6), 0);
  assert.equal(pointsFor(null, cast, 6), 0);
});
