import React from 'react';
import IsoScene, { proj } from './engine';

const b = (x, y, z, w, d, h, c, extra) => ({ x, y, z, w, d, h, c, ...extra });
const WOOD = '#6e4429';
const LEAF = '#5f8a4a';

const tree = (x, y) => [b(x + 0.22, y + 0.22, 0, 0.26, 0.26, 0.5, WOOD), b(x, y, 0.5, 0.7, 0.7, 0.75, LEAF)];

// ---- Archipelago ---------------------------------------------------------
const GRID = [
  '......LL........',
  '.....LLLL.......',
  '.....LLLL.......',
  '....LLLLL.......',
  '....LLLLL.......',
  '.....LLLLLL.....',
  '......LLLLLLL...',
  '....L.....LLLL..',
  '....LL.....LL...',
  '.L.........L....',
  '.L...VV...VVV...',
  '.L..VVV..VVVVV..',
  '.L..VVV.VVVV.V..',
  'L....VV.VV...V..',
  'L....VV..V......',
  'L.....MMMMM.....',
  '......MMMMMMM...',
  '.....MMMMMMMMM..',
  '....MMMMMMMMMM..',
  '...MMMMMMMMMM...',
  '...MM..MMMMMM.M.',
  '...M....MMMM..M.'
];
const GROUP = { L: '#7d9a55', V: '#c9a75e', M: '#a8714e' };

function archipelagoBoxes() {
  const cells = [];
  GRID.forEach((row, y) => {
    if (row.length !== 16) throw new Error(`archipelago row ${y} has ${row.length} cells`);
    [...row].forEach((ch, x) => {
      if (GROUP[ch]) cells.push(b(x, y, 0, 1, 1, 0.55, GROUP[ch], { className: 'iso-rise', style: { '--d': `${(x + y) * 28}ms` } }));
    });
  });
  return [b(-1.5, -1.5, -0.35, 19, 25.5, 0.35, '#dfeaee', { layer: -1 }), ...cells];
}

export function Archipelago({ className = '' }) {
  const u = 8;
  const text = (x, y, s) => {
    const [px, py] = proj(x, y, 1.2, u);
    return <text x={px} y={py} className="iso-label" textAnchor="middle">{s}</text>;
  };
  const [rx, ry] = proj(6.5, 6.5, 0.3, u);
  return (
    <IsoScene boxes={archipelagoBoxes()} u={u} pad={4} className={className} label="Isometric map of the Philippines showing Luzon, Visayas and Mindanao">
      <ellipse className="iso-ripple" cx={rx} cy={ry} rx="9" ry="4.5" />
      <ellipse className="iso-ripple iso-ripple-late" cx={rx} cy={ry} rx="9" ry="4.5" />
      {text(7, 3, 'Luzon')}
      {text(9, 11.5, 'Visayas')}
      {text(9, 18, 'Mindanao')}
    </IsoScene>
  );
}

// ---- Mayon Volcano -------------------------------------------------------
export function Mayon({ className = '' }) {
  const layers = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const s = 7 - k * 0.72;
    const c = k < 2 ? '#7d9a58' : k < 4 ? '#8d8a62' : k < 7 ? '#75645a' : '#54463f';
    layers.push(b(4.5 - s / 2, 4.5 - s / 2, k * 0.62, s, s, 0.62, c));
  }
  const topZ = n * 0.62;
  layers.push(b(4.5 - 0.45, 4.5 - 0.45, topZ, 0.9, 0.9, 0.12, '#2f2825'));
  const boxes = [
    b(-0.5, -0.5, -0.35, 10, 10, 0.35, '#dbe5c8', { layer: -1 }),
    ...layers,
    ...tree(0.4, 7.6), ...tree(1.6, 8.3), ...tree(7.6, 7.9), ...tree(8.2, 6.6), ...tree(7.8, 0.6)
  ];
  const [sx, sy] = proj(4.5, 4.5, topZ + 0.2);
  return (
    <IsoScene boxes={boxes} extend={[[4.5, 4.5, topZ + 5]]} pad={6} className={className} label="Isometric illustration of Mayon Volcano">
      {[0, 1, 2].map(i => <circle key={i} className="iso-smoke" cx={sx} cy={sy} r="5" style={{ '--d': `${i * 1.3}s` }} />)}
    </IsoScene>
  );
}

// ---- Chocolate Hills -----------------------------------------------------
const HILLS = [
  [1.6, 1.4, 1.0], [4.4, 1.0, 1.3], [7.2, 1.9, 0.95], [2.6, 3.9, 1.35], [5.6, 4.1, 1.0],
  [8.3, 4.6, 1.2], [1.2, 6.5, 0.95], [4.2, 6.8, 1.15], [6.9, 7.3, 1.35], [9.2, 8.6, 0.9]
];

function Hill({ gx, gy, r, i, u }) {
  const [cx, cy] = proj(gx, gy, 0, u);
  const w = r * u * 1.15;
  const h = r * u * 1.25;
  const dome = `M ${-w} 0 C ${-w} ${-h * 1.25} ${w} ${-h * 1.25} ${w} 0 A ${w} ${w * 0.5} 0 0 1 ${-w} 0 Z`;
  const shadow = `M 0 ${-h * 0.9375} C ${w / 2} ${-h * 0.9375} ${w} ${-h * 0.625} ${w} 0 A ${w} ${w * 0.5} 0 0 1 0 ${w * 0.5} Z`;
  return (
    <g transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}>
      <g className="iso-rise" style={{ '--d': `${i * 90}ms` }}>
        <path d={dome} fill="#b98a55" />
        <path d={shadow} fill="#94653a" />
        <path d={`M ${-w * 0.55} ${-h * 0.62} Q ${-w * 0.3} ${-h * 0.85} ${-w * 0.05} ${-h * 0.88}`} fill="none" stroke="#d4aa72" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </g>
  );
}

export function ChocolateHills({ className = '' }) {
  const u = 15;
  const ground = [b(-0.5, -0.5, -0.35, 11.5, 11.5, 0.35, '#d6e2c0', { layer: -1 })];
  const sorted = [...HILLS].sort((a, c) => a[0] + a[1] - (c[0] + c[1]));
  return (
    <IsoScene boxes={ground} u={u} pad={6} extend={[[5, 5, 5]]} className={className} label="Isometric illustration of the Chocolate Hills of Bohol">
      {sorted.map(([gx, gy, r], i) => <Hill key={i} gx={gx} gy={gy} r={r} i={i} u={u} />)}
    </IsoScene>
  );
}

// ---- Banaue Rice Terraces ------------------------------------------------
export function BanaueTerraces({ className = '' }) {
  const boxes = [b(-0.5, -0.5, -0.35, 9.5, 9.5, 0.35, '#dbe5c8', { layer: -1 })];
  for (let i = 0; i < 6; i++) {
    const s = 8.5 - i * 1.3;
    const z = i * 0.7;
    boxes.push(b(0, 0, z, s, s, 0.7, i % 2 ? '#86a85a' : '#6f9448'));
    if (i === 1 || i === 3) boxes.push(b(0.25, 0.25, z + 0.7, s - 0.5, s - 0.5, 0.05, '#bcd9dc', { className: 'iso-water' }));
  }
  boxes.push(b(0.6, 0.6, 4.2, 1.1, 1.1, 0.7, '#a97b4f'), b(0.5, 0.5, 4.9, 1.3, 1.3, 0.45, '#7a5232'));
  return <IsoScene boxes={boxes} pad={6} className={className} label="Isometric illustration of the Banaue Rice Terraces" />;
}

// ---- Taal Volcano ---------------------------------------------------------
export function Taal({ className = '' }) {
  const boxes = [b(-0.5, -0.5, -0.35, 12, 12, 0.35, '#cfe3ea', { layer: -1 })];
  const tiers = [[6.4, '#7d9a58'], [5.2, '#86a05a'], [4, '#8d8a62'], [2.8, '#75645a']];
  tiers.forEach(([size, c], k) => boxes.push(b(5.5 - size / 2, 5.5 - size / 2, k * 0.6, size, size, 0.6, c)));
  boxes.push(b(4.7, 4.7, 2.4, 1.6, 1.6, 0.06, '#8fbac8', { className: 'iso-water' }));
  boxes.push(...tree(2.6, 7.6), ...tree(7.9, 3.0));
  const [sx, sy] = proj(5.5, 5.5, 2.6);
  return (
    <IsoScene boxes={boxes} extend={[[5.5, 5.5, 6]]} pad={6} className={className} label="Isometric illustration of Taal Volcano on its lake island">
      {[0, 1].map(i => <circle key={i} className="iso-smoke" cx={sx} cy={sy} r="4" style={{ '--d': `${i * 2}s` }} />)}
    </IsoScene>
  );
}

// ---- Hundred Islands ------------------------------------------------------
const ISLETS = [[1.5, 1.5, 1.7], [5, 0.8, 1.3], [8.5, 2.5, 1.9], [2.5, 5.8, 1.5], [6, 6.5, 2.1], [9.5, 8.5, 1.3], [0.8, 9.2, 1.2], [6.8, 3.9, 1], [3.4, 9.6, 1.6]];
export function HundredIslands({ className = '' }) {
  const boxes = [b(-0.5, -0.5, -0.35, 12.5, 12.5, 0.35, '#cfe3ea', { layer: -1 })];
  ISLETS.forEach(([x, y, size], i) => {
    const style = { '--d': `${i * 110}ms` };
    boxes.push(b(x, y, 0, size, size, 0.5, '#a09484', { className: 'iso-rise', style }));
    boxes.push(b(x + 0.1, y + 0.1, 0.5, size - 0.2, size - 0.2, 0.45, '#6f9a4e', { className: 'iso-rise', style }));
    if (size > 1.4) boxes.push(b(x + size / 2 - 0.25, y + size / 2 - 0.25, 0.95, 0.5, 0.5, 0.6, LEAF, { className: 'iso-rise', style }));
  });
  return <IsoScene boxes={boxes} pad={6} className={className} label="Isometric illustration of the Hundred Islands" />;
}

export const LANDMARKS = [
  { id: 'mayon', name: 'Mayon Volcano', place: 'Albay, Bicol', Scene: Mayon, blurb: 'Famous for its near-perfect cone, it is the most active volcano in the country.' },
  { id: 'chocolate', name: 'Chocolate Hills', place: 'Bohol, Central Visayas', Scene: ChocolateHills, blurb: 'Over a thousand grass-covered limestone mounds that turn brown in the dry season.' },
  { id: 'taal', name: 'Taal Volcano', place: 'Batangas, Calabarzon', Scene: Taal, blurb: 'One of the smallest active volcanoes in the world, set on an island inside Taal Lake.' },
  { id: 'hundred', name: 'Hundred Islands', place: 'Pangasinan, Ilocos Region', Scene: HundredIslands, blurb: 'More than a hundred small limestone islets scattered across Lingayen Gulf.' },
  { id: 'banaue', name: 'Banaue Rice Terraces', place: 'Ifugao, Cordillera', Scene: BanaueTerraces, blurb: 'Terraces carved into the mountains by the Ifugao people over many centuries.' }
];

