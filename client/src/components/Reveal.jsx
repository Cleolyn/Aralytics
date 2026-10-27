import React, { useEffect, useRef, useState } from 'react';

// Adds `is-visible` once the element scrolls into view. Styles live in index.css and only hide content
// when the visitor has not asked for reduced motion.
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal${seen ? ' is-visible' : ''} ${className}`.trim()} style={{ '--reveal-delay': `${delay}ms` }} {...rest}>{children}</Tag>;
}
