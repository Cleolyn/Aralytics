import React, { useEffect, useRef } from 'react';
import { X } from '../icons';

export default function Dialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]')];
    (controls()[0] || dialog).focus();
    const trap = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = controls();
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = overflow; dialog.removeEventListener('keydown', trap); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <div className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
      {children}
    </section>
  </div>;
}
