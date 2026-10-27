import React from 'react';
import IsoScene, { shift } from './engine';

const SKIN = '#c58b5f';
const HAIR = '#241912';
const STEEL = '#bfc3c9';
const GOLD = '#c9a24b';
const WOOD = '#6e4429';
const b = (x, y, z, w, d, h, c, extra) => ({ x, y, z, w, d, h, c, ...extra });

// Faceless voxel person centred on the origin, feet at z = 0. Returns { boxes, torsoZ }.
function person({ top, bottom, shoe = '#2b2420', skirt, longHair, bare, hairColor = HAIR, sit }) {
  const out = [];
  let torsoZ;
  if (sit) {
    torsoZ = 1.45;
    out.push(b(-0.55, -0.1, 1, 1.1, 1.1, 0.45, bottom));
    out.push(b(-0.55, 0.75, 0.2, 0.5, 0.5, 1.25, bottom), b(0.05, 0.75, 0.2, 0.5, 0.5, 1.25, bottom));
    out.push(b(-0.6, 0.7, 0, 0.6, 0.65, 0.25, shoe), b(0, 0.7, 0, 0.6, 0.65, 0.25, shoe));
  } else if (skirt) {
    torsoZ = 1.9;
    out.push(b(-0.85, -0.6, 0.15, 1.7, 1.2, 1.75, skirt));
    out.push(b(-0.5, -0.3, 0, 1, 0.6, 0.15, shoe));
  } else {
    torsoZ = 1.6;
    out.push(b(-0.55, -0.25, 0.25, 0.5, 0.5, 1.35, bottom), b(0.05, -0.25, 0.25, 0.5, 0.5, 1.35, bottom));
    out.push(b(-0.6, -0.3, 0, 0.6, 0.65, 0.25, shoe), b(0, -0.3, 0, 0.6, 0.65, 0.25, shoe));
  }
  const arm = bare ? SKIN : top;
  out.push(b(-0.65, -0.35, torsoZ, 1.3, 0.7, 1.6, bare ? SKIN : top));
  out.push(b(-1.05, -0.2, torsoZ + 0.2, 0.4, 0.4, 1.4, arm), b(0.65, -0.2, torsoZ + 0.2, 0.4, 0.4, 1.4, arm));
  out.push(b(-1.05, -0.2, torsoZ - 0.1, 0.4, 0.4, 0.3, SKIN), b(0.65, -0.2, torsoZ - 0.1, 0.4, 0.4, 0.3, SKIN));
  out.push(b(-0.45, -0.45, torsoZ + 1.6, 0.9, 0.9, 0.9, SKIN));
  out.push(b(-0.5, -0.5, torsoZ + 2.25, 1, 1, 0.3, hairColor));
  if (longHair) out.push(b(-0.5, -0.72, torsoZ + 0.6, 1, 0.28, 2, hairColor));
  else out.push(b(-0.5, -0.55, torsoZ + 1.9, 1, 0.15, 0.6, hairColor));
  return { boxes: out, torsoZ };
}

const platform = [b(-2.5, -2.5, -0.35, 5, 5, 0.35, '#efe7de', { layer: -1 })];
const plinth = (plaque = '#5a3827') => [
  b(-1.9, -1.9, 0, 3.8, 3.8, 0.45, '#d8d0c6'),
  b(-1.5, -1.5, 0.45, 3, 3, 1.05, '#e9e3da'),
  b(-0.8, 1.5, 0.75, 1.6, 0.07, 0.45, plaque)
];
const PLINTH_TOP = 1.5;

function build(p, props, accessories) {
  const { boxes, torsoZ } = person(props);
  return { base: [...platform, ...plinth()], figure: shift([...boxes, ...accessories(torsoZ)], 0, 0, PLINTH_TOP), p };
}

const rizal = () => build('rizal', { top: '#2c2c32', bottom: '#2c2c32' }, z => [
  b(-0.28, 0.35, z + 0.35, 0.56, 0.07, 1.2, '#f6f1ea'),
  b(0.75, -0.4, z - 0.15, 0.7, 0.8, 0.32, WOOD, { top: '#f2e9da' })
]);

const bonifacio = () => build('bonifacio', { top: '#b3322a', bottom: '#f4eee7' }, z => [
  b(-0.52, -0.52, z + 2.0, 1.04, 1.04, 0.18, '#b3322a'),
  b(1.18, -0.08, z + 0.1, 0.16, 0.16, 2.4, STEEL),
  b(1.12, -0.12, z - 0.2, 0.28, 0.24, 0.3, WOOD)
]);

const gabriela = () => build('gabriela', { top: '#f3ece1', skirt: '#7c3a2d', longHair: true }, z => [
  b(1.18, -0.08, z + 0.1, 0.14, 0.14, 2.6, STEEL),
  b(1.08, -0.12, z - 0.15, 0.34, 0.24, 0.25, GOLD)
]);

const lapulapu = () => build('lapulapu', { top: SKIN, bottom: '#9a2f26', bare: true }, z => [
  b(-0.52, -0.52, z + 2.0, 1.04, 1.04, 0.18, GOLD),
  b(1.18, -0.1, z - 0.2, 0.16, 0.26, 2.2, STEEL),
  b(1.18, -0.15, z + 1.9, 0.16, 0.36, 0.9, STEEL),
  b(1.12, -0.14, z - 0.45, 0.28, 0.3, 0.3, WOOD),
  b(-1.6, -0.55, z - 0.3, 0.14, 1.1, 2.1, '#7a4a2a'),
  b(-1.62, -0.55, z + 0.5, 0.14, 1.1, 0.35, '#b3322a')
]);

function mabini() {
  const { boxes, torsoZ } = person({ top: '#37312c', bottom: '#37312c', sit: true });
  const chair = [
    b(-0.85, -0.75, 0.7, 1.7, 1.45, 0.3, WOOD),
    b(-0.85, -0.85, 1, 1.7, 0.2, 2, WOOD),
    b(-0.85, -0.75, 0, 0.2, 0.2, 0.7, WOOD), b(0.65, -0.75, 0, 0.2, 0.2, 0.7, WOOD),
    b(-0.85, 0.5, 0, 0.2, 0.2, 0.7, WOOD), b(0.65, 0.5, 0, 0.2, 0.2, 0.7, WOOD)
  ];
  const extras = [b(-0.28, 0.35, torsoZ + 0.35, 0.56, 0.07, 1.2, '#f6f1ea'), b(-0.45, 0.25, torsoZ - 0.1, 0.9, 0.35, 0.22, '#f2e9da')];
  return { base: [...platform, ...plinth()], figure: shift([...chair, ...boxes, ...extras], 0, 0, PLINTH_TOP), p: 'mabini' };
}

export const HEROES = [
  {
    id: 'rizal', name: 'José Rizal', years: '1861–1896', role: 'Pambansang Bayani', make: rizal,
    blurb: 'A doctor, writer and reformer. His novels Noli Me Tangere and El Filibusterismo awakened Filipinos to injustice under colonial rule.'
  },
  {
    id: 'bonifacio', name: 'Andrés Bonifacio', years: '1863–1897', role: 'Ama ng Katipunan', make: bonifacio,
    blurb: 'Founder and Supremo of the Katipunan, the secret society that began the Philippine Revolution in 1896.'
  },
  {
    id: 'gabriela', name: 'Gabriela Silang', years: '1731–1763', role: 'Lider ng Ilocos', make: gabriela,
    blurb: 'After the death of her husband Diego, she took command of the Ilocano revolt against Spanish rule, among the first women to lead one.'
  },
  {
    id: 'lapulapu', name: 'Lapulapu', years: 'died c. 1542', role: 'Datu ng Mactan', make: lapulapu,
    blurb: 'Chieftain of Mactan who led his warriors against Ferdinand Magellan’s forces in the Battle of Mactan on April 27, 1521.'
  },
  {
    id: 'mabini', name: 'Apolinario Mabini', years: '1864–1903', role: 'Utak ng Rebolusyon', make: mabini,
    blurb: 'Called the Brain of the Revolution, he advised Aguinaldo despite paralysis and became the first Prime Minister of the Republic.'
  }
];

export function HeroFigure({ hero, label, className = '' }) {
  const { base, figure } = hero.make();
  return <IsoScene boxes={base} figure={figure} label={label} className={className} pad={3} />;
}
