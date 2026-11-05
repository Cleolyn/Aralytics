/**
 * localStorage helpers that never throw. Storage can be unavailable (private
 * browsing, blocked site data, quota), and a failed write must not break a flow
 * that otherwise succeeded, such as a submitted quiz.
 */

export function readText(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readJSON(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** @returns {boolean} whether the value was stored */
export function write(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to clean up */
  }
}
