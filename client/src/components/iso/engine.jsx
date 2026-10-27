import React from 'react';

// Isometric helpers: x runs right-down, y runs left-down, z runs up. Larger x+y is nearer the viewer.
export const U = 14;
const COS30 = 0.866;
const SIN30 = 0.5;

export const proj = (x, y, z, u = U) => [(x - y) * COS30 * u, (x + y) * SIN30 * u - z * u];

const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
export function shade(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const mix = v => clamp(v + (target - v) * p);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

const toPoints = (corners, u) => corners.map(([x, y, z]) => proj(x, y, z, u).map(v => v.toFixed(2)).join(',')).join(' ');

export function Box({ x, y, z, w, d, h, c, u = U, top, left, right, opacity, className, style }) {
  const t = top || shade(c, 0.2);
  const l = left || c;
  const r = right || shade(c, -0.22);
  const face = (corners, fill) => <polygon points={toPoints(corners, u)} fill={fill} stroke={fill} strokeWidth="0.6" strokeLinejoin="round" />;
  return (
    <g opacity={opacity} className={className} style={style}>
      {face([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], r)}
      {face([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], l)}
      {face([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], t)}
    </g>
  );
}

export const shift = (boxes, dx, dy, dz) => boxes.map(b => ({ ...b, x: b.x + dx, y: b.y + dy, z: b.z + dz }));

const depth = b => (b.layer || 0) * 1000 + (b.x + b.w / 2) + (b.y + b.d / 2) + (b.z + b.h / 2) * 1.01;

export function Boxes({ boxes, u = U }) {
  const sorted = [...boxes].sort((a, b) => depth(a) - depth(b));
  return <>{sorted.map((b, i) => <Box key={i} u={u} {...b} />)}</>;
}

function bounds(boxes, u, extra = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const take = ([px, py]) => { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); };
  boxes.forEach(b => {
    [0, b.w].forEach(dx => [0, b.d].forEach(dy => [0, b.h].forEach(dz => take(proj(b.x + dx, b.y + dy, b.z + dz, u)))));
  });
  extra.forEach(([x, y, z]) => take(proj(x, y, z, u)));
  return { minX, minY, maxX, maxY };
}

// A self-sizing isometric scene. Anything passed as children is drawn on top in the same coordinate space.
export default function IsoScene({ boxes, figure = [], children, u = U, pad = 8, extend = [], label, className = '', before }) {
  const { minX, minY, maxX, maxY } = bounds([...boxes, ...figure], u, extend);
  const view = `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + pad * 2).toFixed(1)} ${(maxY - minY + pad * 2).toFixed(1)}`;
  return (
    <svg className={`iso ${className}`} viewBox={view} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} focusable="false">
      {before}
      <Boxes boxes={boxes} u={u} />
      {figure.length > 0 && <g className="iso-bob"><Boxes boxes={figure} u={u} /></g>}
      {children}
    </svg>
  );
}
