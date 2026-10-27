import React from 'react';
import IsoScene from './engine';

const b = (x, y, z, w, d, h, c, extra) => ({ x, y, z, w, d, h, c, ...extra });

// Tile colours step from pale sand to the brand brown along the diagonal.
const RAMP = ['#efe6dc', '#e4d6c7', '#d6c1ac', '#c4a78b', '#ad8666', '#936548', '#7a4d37', '#66402e', '#5a3827'];

const tiles = [];
for (let x = 0; x < 5; x++) {
  for (let y = 0; y < 5; y++) {
    tiles.push(b(x + 0.04, y + 0.04, 0, 0.92, 0.92, 0.5, RAMP[x + y], { className: 'iso-wave', style: { '--d': `${(x + y) * 130}ms` } }));
  }
}

// A stack of three books that drops in one by one on top of the wave.
const book = (x, y, z, w, d, h, cover, i) => {
  const o = { className: 'iso-drop', style: { '--d': `${i * 420}ms` } };
  return [
    b(x, y, z, w, d, 0.07, cover, o),
    b(x + 0.03, y + 0.03, z + 0.07, w - 0.06, d - 0.06, h - 0.14, '#f6efe6', o),
    b(x, y, z + h - 0.07, w, d, 0.07, cover, o)
  ];
};
const books = [
  ...book(0.9, 0.8, 0.5, 2.6, 2.0, 0.5, '#5a3827', 0),
  ...book(1.1, 1.0, 1.0, 2.3, 1.9, 0.45, '#6f8f4e', 1),
  ...book(1.0, 0.95, 1.45, 2.2, 1.7, 0.4, '#c9a24b', 2)
];

export default function IsoLoader({ children = 'Loading…', variant = 'inline', progress }) {
  return (
    <div className={`iso-loader iso-loader-${variant}`} role="status">
      {variant === 'page' && <span className="iso-loader-brand">Aralytics</span>}
      <div className="iso-loader-art"><IsoScene boxes={tiles} figure={books} pad={4} /></div>
      <p className="iso-loader-text">{children}<span className="iso-dots" aria-hidden="true"><i /><i /><i /></span></p>
      {progress !== undefined && (
        <div className="iso-progress">
          <div className="iso-progress-track" role="progressbar" aria-label="Loading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <span className="iso-progress-fill" style={{ transform: `scaleX(${Math.min(100, Math.max(0, progress)) / 100})` }} />
          </div>
          <span className="iso-progress-value" aria-hidden="true">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  );
}
