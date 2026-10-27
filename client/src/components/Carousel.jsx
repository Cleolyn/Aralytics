import React, { Children, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from './icons';

// Scroll-snap carousel. Arrow buttons and the Left/Right keys move one card at a time.
export default function Carousel({ title, label, children }) {
  const track = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [range, setRange] = useState([1, 1]);
  const items = Children.toArray(children);

  const stepSize = node => {
    const first = node.firstElementChild;
    const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
    return { gap, step: first ? first.offsetWidth + gap : node.clientWidth };
  };

  const measure = useCallback(() => {
    const node = track.current;
    if (!node) return;
    const { gap, step } = stepSize(node);
    const visible = Math.max(1, Math.round((node.clientWidth + gap) / step));
    const from = Math.min(items.length, Math.round(node.scrollLeft / step) + 1);
    setRange([from, Math.min(items.length, from + visible - 1)]);
    setEdges({ start: node.scrollLeft <= 4, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 4 });
  }, [items.length]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const move = dir => {
    const node = track.current;
    node.scrollBy({ left: dir * stepSize(node).step });
  };
  const onKey = e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  };

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label={label}>
      <div className="carousel-head">
        <h3>{title}</h3>
        <div className="carousel-controls">
          <span className="carousel-count" aria-live="polite">{range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`} of {items.length}</span>
          <button type="button" className="arrow-btn" onClick={() => move(-1)} disabled={edges.start} aria-label="Previous wonders"><ArrowLeft size={20} aria-hidden="true" /></button>
          <button type="button" className="arrow-btn" onClick={() => move(1)} disabled={edges.end} aria-label="Next wonders"><ArrowRight size={20} aria-hidden="true" /></button>
        </div>
      </div>
      <div ref={track} className="carousel-track" tabIndex={0} role="group" aria-label={`${label} slides. Use the left and right arrow keys to browse.`} onScroll={measure} onKeyDown={onKey}>
        {items.map((item, i) => React.cloneElement(item, { 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of ${items.length}` }))}
      </div>
    </section>
  );
}
