import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Globe2, ChartNoAxesColumn } from '../components/icons';
import PublicLayout from '../components/PublicLayout';

export default function LandingPage() {
  return (
    <PublicLayout>
      <section className="hero hero-landing">
        <div>
          <span className="eyebrow">Grade 10 · Araling Panlipunan</span>
          <h1 style={{ marginTop: 16 }}>Learn Araling Panlipunan the easy way.</h1>
          <p>Read your class lessons, answer quizzes, and check your grades in one place.</p>
          <div className="hero-actions">
            <Link to="/register?role=STUDENT" className="btn btn-primary">
              Start as Student <ArrowRight size={17} />
            </Link>
            <Link to="/login?role=TEACHER" className="btn btn-secondary">
              I am a Teacher
            </Link>
          </div>
        </div>
        <img
          className="hero-image"
          src="/images/community-learning.jpg"
          alt=""
          width="1774"
          height="887"
          fetchPriority="high"
        />
      </section>
      <section id="how-it-works" className="feature-strip" aria-label="How Aralytics works">
        {[
          [BookOpen, 'Read lessons', 'Open your class reading materials anytime, even when offline.'],
          [Globe2, 'Answer activities', 'Take multiple choice quizzes and pass your class tasks online.'],
          [ChartNoAxesColumn, 'Check your grades', 'See your scores, teacher comments, and extra practice materials.']
        ].map(([Icon, title, copy]) => (
          <div key={title} className="feature">
            <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
            <h2>{title}</h2>
            <p>{copy}</p>
          </div>
        ))}
      </section>
      <section id="about" className="hero" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))' }}>
        <div>
          <h2>Made for students and teachers.</h2>
          <p>
            Aralytics keeps your Grade 10 Araling Panlipunan lessons, quizzes, and grades together so classwork is simple to follow.
          </p>
        </div>
        <div>
          <h3>For students</h3>
          <p>Read your lessons, submit your work, and review topics at your own pace.</p>
          <Link className="text-action" to="/register?role=STUDENT">
            Start learning <ArrowRight size={16} />
          </Link>
        </div>
        <div>
          <h3>For teachers</h3>
          <p>Upload lessons, create quizzes, check student work, and guide your classes.</p>
          <Link className="text-action" to="/login?role=TEACHER">
            Open teacher page <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
