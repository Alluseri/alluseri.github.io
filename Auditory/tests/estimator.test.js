import test from "node:test";
import assert from "node:assert/strict";

import { createEstimator } from "../src/game/estimator.js";

test("warm-up deltas are returned before adaptive selection begins", () => {
  const estimator = createEstimator({
    minCents: 3,
    maxCents: 120,
    warmupDeltas: [120, 80, 50]
  });

  assert.equal(estimator.getNextDelta(), 120);
  estimator.recordRound({ deltaCents: 120, guessResults: [true, true] });
  assert.equal(estimator.getNextDelta(), 80);
  estimator.recordRound({ deltaCents: 80, guessResults: [true, true] });
  assert.equal(estimator.getNextDelta(), 50);
});

test("strong performance at low deltas pushes the estimate down", () => {
  const estimator = createEstimator({
    minCents: 3,
    maxCents: 120,
    warmupDeltas: []
  });

  const baseline = estimator.getEstimate();

  for (let index = 0; index < 6; index += 1) {
    estimator.recordRound({ deltaCents: 6, guessResults: [true, true] });
  }

  assert.ok(estimator.getEstimate() < baseline);
});

test("poor performance at high deltas pushes the estimate up", () => {
  const estimator = createEstimator({
    minCents: 3,
    maxCents: 120,
    warmupDeltas: []
  });

  const baseline = estimator.getEstimate();

  for (let index = 0; index < 5; index += 1) {
    estimator.recordRound({ deltaCents: 80, guessResults: [false, false] });
  }

  assert.ok(estimator.getEstimate() > baseline);
});

test("stop logic respects minimum rounds before confidence can end the session", () => {
  const estimator = createEstimator({
    minCents: 3,
    maxCents: 120,
    warmupDeltas: [],
    minRounds: 2,
    maxRounds: 6,
    targetWidthCents: 200
  });

  estimator.recordRound({ deltaCents: 20, guessResults: [true, true] });
  assert.equal(estimator.shouldStop(), false);

  estimator.recordRound({ deltaCents: 20, guessResults: [true, true] });
  assert.equal(estimator.shouldStop(), true);
});

test("max rounds hard-stop still ends the session even without a tight band", () => {
  const estimator = createEstimator({
    minCents: 3,
    maxCents: 120,
    warmupDeltas: [],
    minRounds: 10,
    maxRounds: 3,
    targetWidthCents: 0.1
  });

  estimator.recordRound({ deltaCents: 40, guessResults: [true, false] });
  estimator.recordRound({ deltaCents: 40, guessResults: [true, false] });
  assert.equal(estimator.shouldStop(), false);

  estimator.recordRound({ deltaCents: 40, guessResults: [true, false] });
  assert.equal(estimator.shouldStop(), true);
});
