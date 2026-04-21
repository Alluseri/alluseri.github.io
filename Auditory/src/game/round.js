export const DIRECTION_UP = "higher";
export const DIRECTION_DOWN = "lower";

export const DEFAULT_BASE_RANGE = Object.freeze({
  minBaseHz: 220,
  maxBaseHz: 880
});

export const DEFAULT_PLAYABLE_RANGE = Object.freeze({
  minPlayableHz: 196,
  maxPlayableHz: 988
});

export function centsToRatio(deltaCents) {
  return 2 ** (deltaCents / 1200);
}

export function shiftFrequency(baseHz, deltaCents, direction) {
  const ratio = centsToRatio(deltaCents);

  if (direction === DIRECTION_UP) {
    return baseHz * ratio;
  }

  if (direction === DIRECTION_DOWN) {
    return baseHz / ratio;
  }

  throw new Error(`Unknown direction: ${direction}`);
}

export function generateRound({ baseHz, deltaCents, rng = Math.random }) {
  if (!Number.isFinite(baseHz) || baseHz <= 0) {
    throw new Error("baseHz must be a positive number.");
  }

  if (!Number.isFinite(deltaCents) || deltaCents <= 0) {
    throw new Error("deltaCents must be a positive number.");
  }

  const directions = [
    rng() < 0.5 ? DIRECTION_DOWN : DIRECTION_UP,
    rng() < 0.5 ? DIRECTION_DOWN : DIRECTION_UP
  ];

  const secondTone = shiftFrequency(baseHz, deltaCents, directions[0]);
  const thirdTone = shiftFrequency(secondTone, deltaCents, directions[1]);
  const frequencies = [baseHz, secondTone, thirdTone];

  return {
    frequencies,
    directions,
    deltaCents,
    baseHz
  };
}

export function isRoundPlayable(
  round,
  {
    minPlayableHz = DEFAULT_PLAYABLE_RANGE.minPlayableHz,
    maxPlayableHz = DEFAULT_PLAYABLE_RANGE.maxPlayableHz
  } = {}
) {
  return round.frequencies.every(
    (frequency) => frequency >= minPlayableHz && frequency <= maxPlayableHz
  );
}

export function sampleRound({
  deltaCents,
  rng = Math.random,
  minBaseHz = DEFAULT_BASE_RANGE.minBaseHz,
  maxBaseHz = DEFAULT_BASE_RANGE.maxBaseHz,
  minPlayableHz = DEFAULT_PLAYABLE_RANGE.minPlayableHz,
  maxPlayableHz = DEFAULT_PLAYABLE_RANGE.maxPlayableHz,
  maxAttempts = 500
}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const baseHz = minBaseHz + rng() * (maxBaseHz - minBaseHz);
    const round = generateRound({ baseHz, deltaCents, rng });

    if (isRoundPlayable(round, { minPlayableHz, maxPlayableHz })) {
      return round;
    }
  }

  throw new Error("Could not generate a playable round within the allowed range.");
}
