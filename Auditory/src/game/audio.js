const DEFAULT_MIN_GAIN = 0.0001;

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createAudioEngine({
  toneMs = 650,
  gapMs = 220,
  fadeMs = 18,
  volume = 0.7
} = {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  let context = null;
  let masterGain = null;
  let queuedPlayback = Promise.resolve();
  let masterVolume = clamp(volume, 0, 1);

  function ensureContext() {
    if (!AudioContextClass) {
      throw new Error("Web Audio is not available in this browser.");
    }

    if (!context) {
      context = new AudioContextClass();
      masterGain = context.createGain();
      masterGain.gain.value = masterVolume;
      masterGain.connect(context.destination);
    }

    return context;
  }

  async function resume() {
    const activeContext = ensureContext();

    if (activeContext.state !== "running") {
      await activeContext.resume();
    }

    return activeContext;
  }

  function setVolume(nextVolume) {
    masterVolume = clamp(nextVolume, 0, 1);

    if (masterGain && context) {
      masterGain.gain.setValueAtTime(masterVolume, context.currentTime);
    }
  }

  async function schedulePlayback(frequencies) {
    const activeContext = await resume();

    if (!Array.isArray(frequencies) || frequencies.length === 0) {
      throw new Error("Playback requires at least one tone.");
    }

    const sanitizedFrequencies = frequencies.map((frequency) => {
      if (!Number.isFinite(frequency) || frequency <= 0) {
        throw new Error("Playback frequencies must be positive finite numbers.");
      }

      return frequency;
    });

    const fadeSeconds = Math.min(fadeMs / 1000, (toneMs / 1000) / 2);
    const toneSeconds = toneMs / 1000;
    const gapSeconds = gapMs / 1000;
    const startTime = activeContext.currentTime + 0.04;

    sanitizedFrequencies.forEach((frequency, index) => {
      const toneStart = startTime + index * (toneSeconds + gapSeconds);
      const toneEnd = toneStart + toneSeconds;
      const attackEnd = toneStart + fadeSeconds;
      const releaseStart = Math.max(attackEnd, toneEnd - fadeSeconds);

      const oscillator = activeContext.createOscillator();
      const envelope = activeContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);

      envelope.gain.setValueAtTime(DEFAULT_MIN_GAIN, toneStart);
      envelope.gain.linearRampToValueAtTime(1, attackEnd);
      envelope.gain.setValueAtTime(1, releaseStart);
      envelope.gain.linearRampToValueAtTime(DEFAULT_MIN_GAIN, toneEnd);

      oscillator.connect(envelope);
      envelope.connect(masterGain);

      oscillator.start(toneStart);
      oscillator.stop(toneEnd + fadeSeconds);
    });

    const totalMs =
      sanitizedFrequencies.length * toneMs +
      Math.max(0, sanitizedFrequencies.length - 1) * gapMs;

    await wait(totalMs + 120);
  }

  function playSequence(frequencies) {
    const playback = queuedPlayback.then(
      () => schedulePlayback(frequencies),
      () => schedulePlayback(frequencies)
    );

    queuedPlayback = playback.catch(() => {});

    return playback;
  }

  return {
    resume,
    playSequence,
    setVolume
  };
}
