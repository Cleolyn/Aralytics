import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { useAuth } from '../context/AuthContext';

export default function HelpPage() {
  const { user } = useAuth();
  return (
    <PublicLayout simple>
      <article className="container" style={{ maxWidth: 880, paddingInline: 0 }}>
        <div className="page-heading">
          <div>
            <h1>How can we help?</h1>
            <p>Simple tips for using Aralytics.</p>
          </div>
        </div>
        {user && (
          <Link className="text-action" to={user.role === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard'}>
            ← Back to home
          </Link>
        )}
        <section id="login" className="section">
          <h2>Signing in</h2>
          <p style={{ marginTop: 16 }}>
            Students can sign in using their LRN, class section, and name. Teachers can sign in using their teacher account. If you need help with your account, ask your teacher or school admin.
          </p>
        </section>
        <section className="section">
          <h2>Lessons and offline reading</h2>
          <p style={{ marginTop: 16 }}>
            Open Lessons to read your class materials. Click Download while you have internet so you can still read them later when offline. Click Mark as read when you finish a lesson.
          </p>
        </section>
        <section className="section">
          <h2>Activities and quizzes</h2>
          <p style={{ marginTop: 16 }}>
            Open Activities to see your quizzes and class tasks. Check the instructions and due date before submitting. Quizzes need an internet connection, and you should stay on the quiz page until you finish.
          </p>
        </section>
        <section className="section">
          <h2>Grades and extra practice</h2>
          <p style={{ marginTop: 16 }}>
            My Progress shows your quiz scores, submitted tasks, and teacher comments. If you need extra review on a topic, open Practice to read the suggested material.
          </p>
        </section>
        <section id="account-data" className="section">
          <h2>Your account and privacy</h2>
          <p style={{ marginTop: 16 }}>
            Aralytics saves your name, section, submitted work, quiz scores, and reading progress so you and your teacher can track your classwork. If you are using a shared computer or phone, remember to log out when you are done.
          </p>
        </section>
      </article>
    </PublicLayout>
  );
}
