import React from 'react';
import { Link } from 'react-router-dom';
import Brand from './Brand';

export default function PublicLayout({ children, simple = false, account = false }) {
  return <div className={`public-container${simple ? ' public-container-auth' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="public-header"><Brand />
      {simple || account ? <Link to="/" className="text-action">← Back to home</Link> : <nav className="public-nav" aria-label="Public navigation"><a href="#about" className="optional">About</a><a href="#how-it-works" className="optional">How it works</a><a href="#heroes" className="optional">Heroes</a><a href="#places" className="optional">Places</a><Link to="/login">Log in</Link><Link className="btn btn-primary" to="/register">Get started</Link></nav>}
    </header>
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer className="public-footer"><span>Aralytics · Junior High School Araling Panlipunan</span><span><Link to="/help">Help</Link><Link to="/help#account-data">Account &amp; data</Link></span></footer>
  </div>;
}
