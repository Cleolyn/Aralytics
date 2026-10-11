import React from 'react';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Brand({ to = '/' }) {
  return <Link to={to} className="brand" aria-label="Aralytics home">
    <BookOpen size={38} strokeWidth={1.5} aria-hidden="true" />
    <span><span className="brand-name">Aralytics</span><span className="brand-subtitle">Araling Panlipunan</span></span>
  </Link>;
}
