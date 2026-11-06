import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, ClipboardList, Folder, GraduationCap, LayoutDashboard, Megaphone, ChartNoAxesColumn, Users, FileSpreadsheet, HelpCircle, LogOut, Menu, X } from './icons';
import { ROLE_HOMES } from '../utils/authFlow';
import { UserButton } from '@clerk/react';
import { useAuth } from '../context/AuthContext';
import Brand from './Brand';
import OfflineStatus from './OfflineStatus';

const teacherLinks = [
  ['/teacher/dashboard', 'Overview', LayoutDashboard], ['/teacher/classes', 'Classes', Users],
  ['/teacher/materials', 'Lessons', BookOpen], ['/teacher/assessments', 'Quizzes and Tasks', ClipboardList],
  ['/teacher/gradebook', 'Gradebook', FileSpreadsheet], ['/teacher/reports', 'Reports', ChartNoAxesColumn],
  ['/teacher/announcements', 'Announcements', Megaphone], ['/teacher/files', 'My files', Folder]
];
const adminLinks = [
  ['/admin', 'Instructor access', Users]
];
const learnerLinks = [
  ['/student/dashboard', 'Overview', LayoutDashboard], ['/student/materials', 'Lessons', BookOpen],
  ['/student/activities', 'Activities', ClipboardList], ['/student/progress', 'My Progress', GraduationCap],
  ['/student/announcements', 'Announcements', Megaphone], ['/student/files', 'My files', Folder]
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const sidebarRef = useRef(null);
  const role = user?.role || 'STUDENT';
  const links = { ADMIN: adminLinks, TEACHER: teacherLinks, STUDENT: learnerLinks }[role] || learnerLinks;
  const workspace = { ADMIN: 'Admin', TEACHER: 'Teacher', STUDENT: 'Student' }[role] || 'Student';
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const items = () => [...sidebarRef.current.querySelectorAll('a, button')];
    items()[0]?.focus();
    const handleKey = e => {
      if (e.key === 'Escape') { setOpen(false); menuRef.current?.focus(); }
      if (e.key !== 'Tab') return;
      const focusables = items();
      if (e.shiftKey && document.activeElement === focusables[0]) { e.preventDefault(); focusables.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === focusables.at(-1)) { e.preventDefault(); focusables[0]?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [open]);
  const home = ROLE_HOMES[role] || ROLE_HOMES.STUDENT;
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    {open && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside id="workspace-navigation" ref={sidebarRef} className={`sidebar ${open ? 'open' : ''}`}>
      <Brand to={home} />
      <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button>
      <nav aria-label={`${workspace} navigation`}>
        {links.map(([to,label,Icon]) => <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={19} aria-hidden="true" />{label}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink className="nav-link" to="/help"><HelpCircle size={19} aria-hidden="true" />Help</NavLink>
        <button className="nav-link" onClick={logout} style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }}><LogOut size={19} aria-hidden="true" />Log out</button>
      </div>
    </aside>
    <header className="workspace-header">
      <button ref={menuRef} className="icon-button mobile-menu" onClick={() => setOpen(!open)} aria-label="Open navigation" aria-expanded={open} aria-controls="workspace-navigation"><Menu size={23} /></button>
      <span className="workspace-label">{workspace} workspace</span>
      <div className="header-actions"><OfflineStatus />
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  </>;
}
