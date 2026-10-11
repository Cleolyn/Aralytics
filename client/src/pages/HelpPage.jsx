import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { useAuth } from '../context/AuthContext';

export default function HelpPage() {
  const { user } = useAuth();
  return <PublicLayout simple><article className="container" style={{ maxWidth: 880, paddingInline: 0 }}><div className="page-heading"><div><h1>How can we help?</h1><p>A quick guide to your Aralytics workspace.</p></div></div>
    {user && <Link className="text-action" to={user.role === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard'}>← Back to your workspace</Link>}
    <section id="login" className="section"><h2>Logging in</h2><p style={{ marginTop: 16 }}>Use your email, LRN, or employee ID and your password. Your account opens the correct learner or teacher workspace automatically. If you have forgotten your password or need a teacher account, contact your teacher or school administrator. Password reset by email is not currently available.</p></section>
    <section className="section"><h2>Lessons and offline access</h2><p style={{ marginTop: 16 }}>Open Lessons to browse your materials. Use “Download for offline” while connected. Only downloaded materials are available without internet. Mark lessons as read to record your progress; offline reading records sync when you reconnect.</p></section>
    <section className="section"><h2>Activities and quizzes</h2><p style={{ marginTop: 16 }}>Activities shows your quizzes and performance tasks. Check the instructions and due dates before submitting. Quizzes require internet. During a quiz, keep the assessment window active; focus changes are recorded for teacher review.</p></section>
    <section className="section"><h2>Grades and support</h2><p style={{ marginTop: 16 }}>My Progress shows your own scores, submitted work, and teacher feedback. If practice is recommended, open Pagsulong to work on the suggested material. Teachers review submissions from Gradebook and learner support from Classes.</p></section>
    <section id="account-data" className="section"><h2>Your account and learning records</h2><p style={{ marginTop: 16 }}>Aralytics stores your school account details, class section, submissions, scores, reading progress, and assessment focus records. Teachers can review learner records and feedback. Your browser stores your login session and downloaded learning resources. On a shared device, log out when finished and remove saved downloads through Lessons.</p><p style={{ marginTop: 16 }}>For questions about your school’s data policies or account records, contact your school administrator.</p></section>
  </article></PublicLayout>;
}
