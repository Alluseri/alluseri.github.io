import { createAudioEngine } from "./game/audio.js";
import { createEstimator } from "./game/estimator.js";
import { DIRECTION_DOWN, DIRECTION_UP, sampleRound } from "./game/round.js";
import { loadPreferences, savePreferences } from "./game/storage.js";

const app = document.querySelector("#app");

const AUDIO_SETTINGS = Object.freeze({
  toneMs: 650,
  gapMs: 220,
  fadeMs: 18
});

const ESTIMATOR_SETTINGS = Object.freeze({
  minCents: 3,
  maxCents: 120,
  warmupDeltas: [120, 80, 50],
  minRounds: 10,
  maxRounds: 18,
  targetWidthCents: 12
});

const AUDIO_CHECK_SEQUENCE = [440, 554.37, 659.25];
const EASY_FEEDBACK_MS = 1400;
const HARD_ADVANCE_MS = 320;
const NEXT_ROUND_DELAY_MS = 460;

if (!app) {
  throw new Error("App root not found.");
}

const storedPreferences = loadPreferences();

const state = {
  screen: "landing",
  mode: storedPreferences.mode === "hard" ? "hard" : "easy",
  volume:
    Number.isFinite(storedPreferences.volume) &&
    storedPreferences.volume >= 0 &&
    storedPreferences.volume <= 1
      ? storedPreferences.volume
      : 0.68,
  audioReady: false,
  audioMessage: "Your browser unlocks audio on the first tap. Run a quick check or begin the test directly.",
  audioError: "",
  currentRunId: 0,
  game: null,
  round: null,
  selectedGuesses: [null, null],
  revealResults: null,
  roundPhase: "idle",
  isCheckingAudio: false,
  isSubmitting: false
};

const audioEngine = createAudioEngine({
  ...AUDIO_SETTINGS,
  volume: state.volume
});

function persistPreferences() {
  savePreferences({
    mode: state.mode,
    volume: state.volume
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatCents(value) {
  return `${value.toFixed(value >= 10 ? 1 : 2)} cents`;
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function formatLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createGameSession() {
  return {
    estimator: createEstimator(ESTIMATOR_SETTINGS),
    rounds: [],
    correctGuesses: 0,
    totalGuesses: 0
  };
}

function getSessionEstimate() {
  if (!state.game) {
    return null;
  }

  const median = state.game.estimator.getEstimate();
  const confidence = state.game.estimator.getConfidence();

  return {
    median,
    confidence
  };
}

function getRoundNumber() {
  if (state.round) {
    return state.round.index;
  }

  if (state.game) {
    return state.game.rounds.length;
  }

  return 0;
}

function getProgressPercent() {
  const roundNumber = getRoundNumber();
  return Math.min(
    100,
    (roundNumber / ESTIMATOR_SETTINGS.maxRounds) * 100
  );
}

function getRoundStageLabel() {
  if (!state.round) {
    return "";
  }

  if (state.round.index <= ESTIMATOR_SETTINGS.warmupDeltas.length) {
    return `Warm-up ${state.round.index}/${ESTIMATOR_SETTINGS.warmupDeltas.length}`;
  }

  return "Adaptive measurement";
}

function getPhaseMessage() {
  switch (state.roundPhase) {
    case "listen":
      return "Listen carefully. The sequence plays once and cannot be replayed.";
    case "answering":
      return "Answer both steps before locking the round.";
    case "feedback":
      return "Easy mode shows the resolved steps before the next sequence begins.";
    case "transition":
      return "Estimate updated. Loading the next round.";
    default:
      return "Prepare for the next three-tone sequence.";
  }
}

function createAudioErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Web Audio")) {
    return "This browser could not initialize Web Audio. Try a current desktop or mobile browser.";
  }

  return "Audio playback failed. Check your output device and browser permissions, then try again.";
}

function buildResultsSummary() {
  if (!state.game) {
    return null;
  }

  const estimate = state.game.estimator.getEstimate();
  const confidence = state.game.estimator.getConfidence();
  const accuracy =
    state.game.totalGuesses === 0
      ? 0
      : (state.game.correctGuesses / state.game.totalGuesses) * 100;
  const testedDeltas = state.game.rounds.map((round) => round.deltaCents);
  const tightestDelta = testedDeltas.length
    ? Math.min(...testedDeltas)
    : confidence.lower;
  const lowConfidence =
    state.game.rounds.length >= ESTIMATOR_SETTINGS.maxRounds &&
    confidence.width > ESTIMATOR_SETTINGS.targetWidthCents;

  return {
    estimate,
    confidence,
    accuracy,
    tightestDelta,
    lowConfidence
  };
}

function renderModeButtons() {
  return `
    <div class="mode-toggle" role="tablist" aria-label="Difficulty mode">
      ${["easy", "hard"]
        .map(
          (mode) => `
            <button
              type="button"
              class="mode-chip${state.mode === mode ? " is-active" : ""}"
              data-action="set-mode"
              data-mode="${mode}"
              aria-pressed="${state.mode === mode}"
            >
              ${formatLabel(mode)}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAudioBanner() {
  if (!state.audioError) {
    return "";
  }

  return `
    <div class="banner banner--warning" role="alert">
      <strong>Audio issue</strong>
      <span>${state.audioError}</span>
    </div>
  `;
}

function renderLiveEstimate() {
  const estimate = getSessionEstimate();

  if (!estimate) {
    return "";
  }

  return `
    <aside class="live-estimate" aria-live="polite">
      <span class="eyebrow">Sound Delta-E</span>
      <strong>${formatCents(estimate.median)}</strong>
      <span>
        ${formatLabel(estimate.confidence.label)} confidence · band ${formatCents(
          estimate.confidence.width
        )}
      </span>
    </aside>
  `;
}

function renderLanding() {
  return `
    <div class="layout layout--landing">
      <section class="panel hero-panel">
        <span class="eyebrow">Round-based listening test</span>
        <h1>Hear three tones, then call every move.</h1>
        <p class="lead">
          Each round plays a short sequence once: the second tone shifts up or down
          from the first, then the third shifts again from the second by the same
          delta. Your job is to identify both moves as the steps get smaller.
        </p>
        <div class="info-grid">
          <article class="mini-card">
            <h2>Single listen</h2>
            <p>No replay button. Each sequence is one pass only.</p>
          </article>
          <article class="mini-card">
            <h2>Adaptive estimate</h2>
            <p>The game homes in on the smallest pitch step you can still judge reliably.</p>
          </article>
          <article class="mini-card">
            <h2>Two modes</h2>
            <p>Easy reveals correctness after each round. Hard only updates the running estimate.</p>
          </article>
        </div>
        <div class="button-row">
          <button
            type="button"
            class="button button--secondary"
            data-action="audio-check"
            ${state.isCheckingAudio ? "disabled" : ""}
          >
            ${state.isCheckingAudio ? "Checking..." : "Run audio check"}
          </button>
          <button
            type="button"
            class="button button--primary"
            data-action="start"
            ${state.isCheckingAudio ? "disabled" : ""}
          >
            Start listening test
          </button>
        </div>
        <p class="support-copy">${state.audioMessage}</p>
      </section>

      <section class="panel control-panel">
        <div class="panel-header">
          <div>
            <span class="eyebrow">Session setup</span>
            <h2>Dial in the run.</h2>
          </div>
        </div>
        ${renderModeButtons()}
        <label class="slider-block">
          <span class="slider-row">
            <span>Playback level</span>
            <output>${Math.round(state.volume * 100)}%</output>
          </span>
          <input
            class="slider"
            type="range"
            min="0.1"
            max="1"
            step="0.01"
            value="${state.volume}"
            data-volume
          >
        </label>
        <div class="lab-note">
          <strong>Measurement format</strong>
          <span>Results are shown in cents, a pitch interval that stays meaningful across different base frequencies.</span>
        </div>
        <div class="lab-note">
          <strong>Frequency range</strong>
          <span>Rounds sample comfortable fundamentals and reject sequences that would leave the playable band.</span>
        </div>
      </section>
    </div>
  `;
}

function renderChoiceButton(index, direction, label) {
  const isSelected = state.selectedGuesses[index] === direction;
  const revealEnabled = state.mode === "easy" && state.roundPhase === "feedback";
  const isCorrectAnswer = state.round && state.round.directions[index] === direction;
  const isIncorrectSelection = revealEnabled && isSelected && !isCorrectAnswer;

  return `
    <button
      type="button"
      class="choice-button${isSelected ? " is-selected" : ""}${
        revealEnabled && isCorrectAnswer ? " is-correct" : ""
      }${isIncorrectSelection ? " is-incorrect" : ""}"
      data-action="choose"
      data-index="${index}"
      data-direction="${direction}"
      ${state.roundPhase !== "answering" ? "disabled" : ""}
      aria-pressed="${isSelected}"
    >
      ${label}
    </button>
  `;
}

function renderQuestionCard(index, title, prompt) {
  const revealEnabled = state.mode === "easy" && state.roundPhase === "feedback";
  const resultText =
    revealEnabled && state.revealResults
      ? state.revealResults[index]
        ? "Correct"
        : "Missed"
      : "";

  return `
    <article class="question-card">
      <span class="eyebrow">Step ${index + 1}</span>
      <h3>${title}</h3>
      <p>${prompt}</p>
      <div class="choice-row">
        ${renderChoiceButton(index, DIRECTION_UP, "Higher")}
        ${renderChoiceButton(index, DIRECTION_DOWN, "Lower")}
      </div>
      <div class="result-tag${resultText ? " is-visible" : ""}">
        ${resultText}
      </div>
    </article>
  `;
}

function renderGame() {
  const estimate = getSessionEstimate();

  return `
    <div class="layout layout--game">
      <section class="panel game-panel">
        <div class="panel-header panel-header--spread">
          <div>
            <span class="eyebrow">Round ${getRoundNumber()}</span>
            <h1>Call the direction of each step.</h1>
          </div>
          <div class="meta-column">
            <span class="status-pill">${getRoundStageLabel()}</span>
            <span class="status-pill status-pill--muted">${formatLabel(state.mode)} mode</span>
          </div>
        </div>

        <div class="progress-group">
          <div class="progress-row">
            <span>Session progress</span>
            <span>${getRoundNumber()} / ${ESTIMATOR_SETTINGS.maxRounds} max</span>
          </div>
          <div class="progress-bar" aria-hidden="true">
            <span style="width: ${getProgressPercent()}%"></span>
          </div>
          <div class="confidence-row">
            <span>${getPhaseMessage()}</span>
            ${
              estimate
                ? `<span>${formatLabel(estimate.confidence.label)} confidence</span>`
                : ""
            }
          </div>
        </div>

        <div class="sequence-visual${state.roundPhase === "listen" ? " is-listening" : ""}">
          <div class="sequence-node"><span>1</span></div>
          <div class="sequence-rail"></div>
          <div class="sequence-node"><span>2</span></div>
          <div class="sequence-rail"></div>
          <div class="sequence-node"><span>3</span></div>
        </div>

        <div class="question-grid">
          ${renderQuestionCard(
            0,
            "Tone 2 versus tone 1",
            "Did the second tone move higher or lower than the first?"
          )}
          ${renderQuestionCard(
            1,
            "Tone 3 versus tone 2",
            "Did the third tone move higher or lower than the second?"
          )}
        </div>

        <div class="button-row button-row--end">
          <button
            type="button"
            class="button button--primary"
            data-action="submit"
            ${
              state.roundPhase !== "answering" ||
              state.selectedGuesses.some((guess) => !guess) ||
              state.isSubmitting
                ? "disabled"
                : ""
            }
          >
            ${state.isSubmitting ? "Locking..." : "Lock answers"}
          </button>
        </div>
      </section>

      <section class="panel side-panel">
        <span class="eyebrow">Session notes</span>
        <h2>What matters in this run.</h2>
        <div class="lab-note">
          <strong>Live estimate</strong>
          <span>The top-right badge updates after every submitted round.</span>
        </div>
        <div class="lab-note">
          <strong>No replay</strong>
          <span>Once the tones finish, your memory of the contour is the test.</span>
        </div>
        <div class="lab-note">
          <strong>Confidence band</strong>
          <span>The narrower the band, the more stable the threshold estimate becomes.</span>
        </div>
      </section>
    </div>
  `;
}

function renderResults() {
  const summary = buildResultsSummary();

  if (!summary) {
    return "";
  }

  return `
    <div class="layout layout--results">
      <section class="panel results-panel">
        <span class="eyebrow">Session complete</span>
        <h1>${summary.lowConfidence ? "Threshold estimate captured" : "Threshold estimate locked in"}</h1>
        <p class="lead">
          Your current Sound Delta-E lands at <strong>${formatCents(summary.estimate)}</strong>.
          ${
            summary.lowConfidence
              ? "The app hit the round cap before the confidence band fully tightened."
              : "The posterior confidence band narrowed enough to stop early."
          }
        </p>

        <div class="results-grid">
          <article class="metric-card">
            <span class="eyebrow">Confidence band</span>
            <strong>${formatCents(summary.confidence.lower)} to ${formatCents(
              summary.confidence.upper
            )}</strong>
            <p>${formatLabel(summary.confidence.label)} confidence, width ${formatCents(
              summary.confidence.width
            )}.</p>
          </article>
          <article class="metric-card">
            <span class="eyebrow">Accuracy</span>
            <strong>${formatPercent(summary.accuracy)}</strong>
            <p>${state.game.correctGuesses} correct calls across ${state.game.totalGuesses} step judgments.</p>
          </article>
          <article class="metric-card">
            <span class="eyebrow">Tightest tested step</span>
            <strong>${formatCents(summary.tightestDelta)}</strong>
            <p>Measured across ${state.game.rounds.length} rounds in ${formatLabel(state.mode)} mode.</p>
          </article>
        </div>

        <div class="button-row">
          <button type="button" class="button button--primary" data-action="restart">
            Run another session
          </button>
        </div>
      </section>
    </div>
  `;
}

function render() {
  app.innerHTML = `
    <main class="shell">
      ${renderLiveEstimate()}
      ${renderAudioBanner()}
      ${
        state.screen === "landing"
          ? renderLanding()
          : state.screen === "playing"
            ? renderGame()
            : renderResults()
      }
    </main>
  `;
}

async function handleAudioCheck() {
  if (state.isCheckingAudio || state.isSubmitting) {
    return;
  }

  state.audioError = "";
  state.audioMessage = "Playing a short calibration phrase.";
  state.isCheckingAudio = true;
  render();

  try {
    await audioEngine.resume();
    await audioEngine.playSequence(AUDIO_CHECK_SEQUENCE);
    state.audioReady = true;
    state.audioMessage = "Audio path looks good. When you start, every round will still play only once.";
  } catch (error) {
    state.audioReady = false;
    state.audioError = createAudioErrorMessage(error);
    state.audioMessage = "The audio check did not finish cleanly.";
  } finally {
    state.isCheckingAudio = false;
    render();
  }
}

async function queueNextRound(runId) {
  if (!state.game || runId !== state.currentRunId) {
    return;
  }

  const deltaCents = state.game.estimator.getNextDelta();

  state.round = {
    ...sampleRound({ deltaCents }),
    index: state.game.rounds.length + 1
  };
  state.selectedGuesses = [null, null];
  state.revealResults = null;
  state.roundPhase = "listen";
  render();

  await sleep(NEXT_ROUND_DELAY_MS);

  if (runId !== state.currentRunId || !state.round) {
    return;
  }

  try {
    await audioEngine.playSequence(state.round.frequencies);

    if (runId !== state.currentRunId || !state.round) {
      return;
    }

    state.roundPhase = "answering";
    render();
  } catch (error) {
    state.audioError = createAudioErrorMessage(error);
    state.roundPhase = "idle";
    render();
  }
}

function finalizeGame() {
  state.round = null;
  state.roundPhase = "idle";
  state.revealResults = null;
  state.screen = "results";
  render();
}

async function startGame() {
  if (state.isCheckingAudio || state.isSubmitting) {
    return;
  }

  state.audioError = "";
  state.audioMessage = "Initializing audio and preparing the first sequence.";
  render();

  try {
    await audioEngine.resume();
    state.audioReady = true;
  } catch (error) {
    state.audioReady = false;
    state.audioError = createAudioErrorMessage(error);
    state.audioMessage = "The listening test could not start because audio initialization failed.";
    render();
    return;
  }

  state.currentRunId += 1;
  state.game = createGameSession();
  state.round = null;
  state.selectedGuesses = [null, null];
  state.revealResults = null;
  state.roundPhase = "idle";
  state.screen = "playing";
  render();

  await queueNextRound(state.currentRunId);
}

async function submitRound() {
  if (
    !state.game ||
    !state.round ||
    state.roundPhase !== "answering" ||
    state.isSubmitting ||
    state.selectedGuesses.some((guess) => !guess)
  ) {
    return;
  }

  state.isSubmitting = true;
  state.audioError = "";

  const runId = state.currentRunId;
  const guesses = [...state.selectedGuesses];
  const guessResults = guesses.map(
    (guess, index) => guess === state.round.directions[index]
  );

  state.game.estimator.recordRound({
    deltaCents: state.round.deltaCents,
    guessResults
  });

  state.game.rounds.push({
    baseHz: state.round.baseHz,
    deltaCents: state.round.deltaCents,
    frequencies: [...state.round.frequencies],
    directions: [...state.round.directions],
    guesses,
    guessResults,
    mode: state.mode
  });

  state.game.correctGuesses += guessResults.filter(Boolean).length;
  state.game.totalGuesses += guessResults.length;
  state.revealResults = guessResults;

  if (state.mode === "easy") {
    state.roundPhase = "feedback";
    render();
    await sleep(EASY_FEEDBACK_MS);
  } else {
    state.roundPhase = "transition";
    render();
    await sleep(HARD_ADVANCE_MS);
  }

  if (runId !== state.currentRunId) {
    return;
  }

  state.isSubmitting = false;

  if (state.game.estimator.shouldStop()) {
    finalizeGame();
    return;
  }

  await queueNextRound(runId);
}

function restartToLanding() {
  state.currentRunId += 1;
  state.screen = "landing";
  state.game = null;
  state.round = null;
  state.selectedGuesses = [null, null];
  state.revealResults = null;
  state.roundPhase = "idle";
  state.isSubmitting = false;
  state.audioError = "";
  state.audioMessage = state.audioReady
    ? "Audio is unlocked. You can run another calibration check or start immediately."
    : "Your browser unlocks audio on the first tap. Run a quick check or begin the test directly.";
  render();
}

app.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");

  if (!control) {
    return;
  }

  const { action } = control.dataset;

  if (action === "set-mode") {
    if (state.screen !== "landing") {
      return;
    }

    state.mode = control.dataset.mode === "hard" ? "hard" : "easy";
    persistPreferences();
    render();
    return;
  }

  if (action === "audio-check") {
    void handleAudioCheck();
    return;
  }

  if (action === "start") {
    void startGame();
    return;
  }

  if (action === "choose") {
    if (state.roundPhase !== "answering") {
      return;
    }

    const index = Number.parseInt(control.dataset.index ?? "", 10);
    const direction =
      control.dataset.direction === DIRECTION_DOWN ? DIRECTION_DOWN : DIRECTION_UP;

    if (!Number.isNaN(index) && index >= 0 && index < state.selectedGuesses.length) {
      state.selectedGuesses[index] = direction;
      render();
    }

    return;
  }

  if (action === "submit") {
    void submitRound();
    return;
  }

  if (action === "restart") {
    restartToLanding();
  }
});

app.addEventListener("input", (event) => {
  const control = event.target;

  if (!(control instanceof HTMLInputElement) || !control.hasAttribute("data-volume")) {
    return;
  }

  const nextVolume = Number.parseFloat(control.value);

  if (!Number.isFinite(nextVolume)) {
    return;
  }

  state.volume = nextVolume;
  audioEngine.setVolume(nextVolume);
  persistPreferences();
  render();
});

persistPreferences();
render();
