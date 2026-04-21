const STORAGE_KEY = "auditory:sound-delta-e:preferences";

export function loadPreferences() {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function savePreferences(preferences) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage failures so private-mode browsers can still play.
  }
}
