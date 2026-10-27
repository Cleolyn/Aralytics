import React, { useEffect, useRef, useState } from 'react';
import { HEROES, HeroFigure } from './iso/heroes';
import { ArrowLeft, ArrowRight } from './icons';

const INTERVAL = 7000;
const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function HeroShowcase() {
  const [index, setIndex] = useState(() => Math.max(0, HEROES.findIndex(h => `#${h.id}` === window.location.hash)));
  const [auto, setAuto] = useState(() => !prefersReduced());
  const [hover, setHover] = useState(false);
  const tabs = useRef([]);
  const hero = HEROES[index];
  const playing = auto && !hover;

  useEffect(() => {
    if (!playing) return undefined;
    const id = setTimeout(() => setIndex(i => (i + 1) % HEROES.length), INTERVAL);
    return () => clearTimeout(id);
  }, [playing, index]);

  const choose = i => { setAuto(false); setIndex((i + HEROES.length) % HEROES.length); };
  const step = dir => choose(index + dir);
  const onStageKey = e => {
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };
  const onKey = (e, i) => {
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % HEROES.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + HEROES.length - 1) % HEROES.length : null;
    if (next === null) return;
    e.preventDefault();
    choose(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="showcase" onKeyDown={onStageKey} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="showcase-stage" role="tabpanel" id="hero-panel" aria-labelledby={`hero-tab-${hero.id}`}>
        <button type="button" className="arrow-btn stage-arrow stage-prev" onClick={() => step(-1)} aria-label="Previous hero"><ArrowLeft size={20} aria-hidden="true" /></button>
        <div key={hero.id} className="stage-figure">
          <HeroFigure hero={hero} label={`Isometric figure of ${hero.name}`} />
        </div>
        <button type="button" className="arrow-btn stage-arrow stage-next" onClick={() => step(1)} aria-label="Next hero"><ArrowRight size={20} aria-hidden="true" /></button>
      </div>
      <div className="showcase-body">
        <div key={hero.id} className="showcase-text" aria-live="polite">
          <p className="eyebrow">{hero.role}</p>
          <h3>{hero.name}</h3>
          <p className="showcase-years">{hero.years}</p>
          <p>{hero.blurb}</p>
        </div>
        <div role="tablist" aria-label="Philippine heroes" className="hero-tabs">
          {HEROES.map((h, i) => (
            <button
              key={h.id}
              ref={el => { tabs.current[i] = el; }}
              id={`hero-tab-${h.id}`}
              role="tab"
              aria-selected={i === index}
              aria-controls="hero-panel"
              tabIndex={i === index ? 0 : -1}
              className={`hero-tab${i === index ? ' active' : ''}`}
              onClick={() => choose(i)}
              onKeyDown={e => onKey(e, i)}
            >
              <span>{h.name}</span>
              {i === index && playing && <span className="tab-progress" style={{ animationDuration: `${INTERVAL}ms` }} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
