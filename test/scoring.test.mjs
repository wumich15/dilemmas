import assert from "node:assert/strict";
import { test } from "node:test";
import { pointsForChoice, tallyChoices } from "../js/scoring.js";

const choices = (...optionIndexes) => optionIndexes.map((optionIndex, player) => ({ player, optionIndex }));

test("choice counts are tallied by option", () => {
  assert.deepEqual([...tallyChoices(choices(0, 1, 0, 2, 0))], [[0, 3], [1, 1], [2, 1]]);
});

test("players who choose the unique most common option get one point", () => {
  const cast = choices(0, 0, 1, 2);
  assert.equal(pointsForChoice(0, cast), 1);
  assert.equal(pointsForChoice(1, cast), 0);
  assert.equal(pointsForChoice(2, cast), 0);
});

test("when the most common choice is tied, everyone gets one point", () => {
  const cast = choices(0, 1, 2);
  assert.equal(pointsForChoice(0, cast), 1);
  assert.equal(pointsForChoice(1, cast), 1);
  assert.equal(pointsForChoice(2, cast), 1);
});

test("missing choices do not score", () => {
  assert.equal(pointsForChoice(null, choices(0, 0)), 0);
  assert.equal(pointsForChoice(1, []), 0);
});
