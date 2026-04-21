import test from "node:test";
import assert from "node:assert/strict";

import {
  DIRECTION_DOWN,
  DIRECTION_UP,
  generateRound,
  isRoundPlayable,
  sampleRound
} from "../src/game/round.js";

function createSequenceRng(values) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function createLcg(seed) {
  let value = seed;

  return () => {
    value = (value * 48271) % 0x7fffffff;
    return value / 0x7fffffff;
  };
}

test("generateRound respects direction flags", () => {
  const rng = createSequenceRng([0.8, 0.2]);
  const round = generateRound({ baseHz: 440, deltaCents: 100, rng });

  assert.deepEqual(round.directions, [DIRECTION_UP, DIRECTION_DOWN]);
  assert.equal(round.frequencies.length, 3);
  assert.ok(round.frequencies[1] > round.frequencies[0]);
  assert.ok(round.frequencies[2] < round.frequencies[1]);
});

test("sampleRound always returns a playable sequence inside the allowed band", () => {
  const rng = createLcg(17);

  for (let index = 0; index < 250; index += 1) {
    const round = sampleRound({ deltaCents: 120, rng });
    assert.equal(isRoundPlayable(round), true);
  }
});

test("repeated generation covers all four direction patterns", () => {
  const rng = createLcg(9);
  const patterns = new Set();

  for (let index = 0; index < 120; index += 1) {
    const round = generateRound({ baseHz: 440, deltaCents: 50, rng });
    patterns.add(round.directions.join("-"));
  }

  assert.deepEqual(
    patterns,
    new Set([
      `${DIRECTION_UP}-${DIRECTION_UP}`,
      `${DIRECTION_UP}-${DIRECTION_DOWN}`,
      `${DIRECTION_DOWN}-${DIRECTION_UP}`,
      `${DIRECTION_DOWN}-${DIRECTION_DOWN}`
    ])
  );
});
