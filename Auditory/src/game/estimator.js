function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function normalize(weights) {
  const total = sum(weights);

  if (!Number.isFinite(total) || total <= 0) {
    return weights.map(() => 1 / weights.length);
  }

  return weights.map((weight) => weight / total);
}

function quantileFromPosterior(grid, posterior, target) {
  let running = 0;

  for (let index = 0; index < grid.length; index += 1) {
    running += posterior[index];

    if (running >= target) {
      return grid[index];
    }
  }

  return grid[grid.length - 1];
}

export function createLogGrid(minCents, maxCents, count = 96) {
  const lower = Math.log(minCents);
  const upper = Math.log(maxCents);
  const step = (upper - lower) / (count - 1);

  return Array.from({ length: count }, (_, index) =>
    Math.exp(lower + step * index)
  );
}

export function psychometricAccuracy(deltaCents, thresholdCents, slope = 4) {
  const safeDelta = Math.max(deltaCents, 0.0001);
  const safeThreshold = Math.max(thresholdCents, 0.0001);
  const logRatio = Math.log2(safeDelta / safeThreshold);
  const discrimination = 1 / (1 + Math.exp(-slope * logRatio));

  return 0.5 + 0.5 * discrimination;
}

function getConfidenceLabel(width) {
  if (width <= 12) {
    return "locked";
  }

  if (width <= 24) {
    return "focused";
  }

  if (width <= 40) {
    return "settling";
  }

  return "exploring";
}

export function createEstimator({
  minCents = 3,
  maxCents = 120,
  warmupDeltas = [120, 80, 50],
  gridSize = 96,
  slope = 4,
  minRounds = 10,
  maxRounds = 18,
  targetWidthCents = 12
} = {}) {
  const grid = createLogGrid(minCents, maxCents, gridSize);
  let posterior = Array.from({ length: grid.length }, () => 1 / grid.length);
  const history = [];

  function getEstimate() {
    return quantileFromPosterior(grid, posterior, 0.5);
  }

  function getConfidence() {
    const lower = quantileFromPosterior(grid, posterior, 0.05);
    const upper = quantileFromPosterior(grid, posterior, 0.95);
    const width = upper - lower;

    return {
      lower,
      upper,
      width,
      label: getConfidenceLabel(width)
    };
  }

  function recordRound({ deltaCents, guessResults }) {
    if (!Array.isArray(guessResults) || guessResults.length === 0) {
      throw new Error("guessResults must include at least one observation.");
    }

    if (!Number.isFinite(deltaCents) || deltaCents <= 0) {
      throw new Error("deltaCents must be a positive number.");
    }

    posterior = normalize(
      posterior.map((priorWeight, index) => {
        const threshold = grid[index];
        const probabilityCorrect = psychometricAccuracy(
          deltaCents,
          threshold,
          slope
        );

        const likelihood = guessResults.reduce((running, result) => {
          const observation = result ? probabilityCorrect : 1 - probabilityCorrect;
          return running * observation;
        }, 1);

        return priorWeight * likelihood;
      })
    );

    history.push({
      deltaCents,
      guessResults: [...guessResults]
    });

    return getEstimate();
  }

  function getNextDelta() {
    if (history.length < warmupDeltas.length) {
      return warmupDeltas[history.length];
    }

    return clamp(getEstimate(), minCents, maxCents);
  }

  function shouldStop() {
    if (history.length >= maxRounds) {
      return true;
    }

    if (history.length < minRounds) {
      return false;
    }

    return getConfidence().width <= targetWidthCents;
  }

  return {
    recordRound,
    getEstimate,
    getConfidence,
    getNextDelta,
    shouldStop
  };
}
