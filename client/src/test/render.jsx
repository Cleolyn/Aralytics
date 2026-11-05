import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

/** Renders the current location so tests can assert navigation and query params. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

/**
 * Render a page inside a router.
 * @param {React.ReactElement} ui
 * @param {{ route?: string, path?: string }} options
 */
export function renderPage(ui, { route = '/', path = '*' } = {}) {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={<>{ui}<LocationProbe /></>} />
        {path !== '*' && <Route path="*" element={<LocationProbe />} />}
      </Routes>
    </MemoryRouter>
  );
  return { user, ...result };
}

export const currentLocation = () => document.querySelector('[data-testid="location"]')?.textContent;

/** A File with real bytes, so FileReader produces a base64 payload. */
export function makeFile(name, content = 'file-bytes', type = 'application/pdf') {
  return new File([content], name, { type });
}

export const base64 = text => btoa(text);
