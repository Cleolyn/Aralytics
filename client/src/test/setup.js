import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

let online = true;

beforeEach(() => {
  localStorage.clear();
  online = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
});

afterEach(() => {
  cleanup();
});

/** Simulate the browser going offline/online, including the window event. */
export function setOnline(value) {
  online = value;
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}
