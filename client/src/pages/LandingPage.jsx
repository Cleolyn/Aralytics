import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Globe2, ChartNoAxesColumn } from 'lucide-react';
import PublicLayout from '../components/PublicLayout';

export default function LandingPage() {
  return <PublicLayout>
    <section className="hero hero-landing">
      <div><span className="eyebrow">People · Places · Society</span><h1 style={{ marginTop: 16 }}>Understand our world. Shape our community.</h1><p>Your learning space for Araling Panlipunan. Learn, practice, and grow—isang aralin sa bawat hakbang.</p><div className="hero-actions"><Link to="/register?role=STUDENT" className="btn btn-primary">Start learning <ArrowRight size={17} /></Link><Link to="/login?role=TEACHER" className="btn btn-secondary">I am a teacher</Link></div></div>
      <img className="hero-image" src="/images/community-learning.jpg" alt="" width="1774" height="887" fetchPriority="high" />
    </section>
    <section id="how-it-works" className="feature-strip" aria-label="How Aralytics works">
      {[[BookOpen,'Learn with purpose','Explore lessons connected to the people, places, and issues around you.'],[Globe2,'Practice what matters','Apply what you learn through quizzes and meaningful community activities.'],[ChartNoAxesColumn,'See your progress','Find your scores, teacher feedback, and a clear next step.']].map(([Icon,title,copy]) => <div key={title} className="feature"><Icon size={28} strokeWidth={1.5} aria-hidden="true" /><h2>{title}</h2><p>{copy}</p></div>)}
    </section>
    <section id="about" className="hero" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))' }}>
      <div><h2>Built for learners and teachers.</h2><p>Aralytics brings lessons, activities, and feedback into one clear learning journey. Our current Grade 10 curriculum explores contemporary Philippine issues.</p></div>
      <div><h3>For learners</h3><p>Continue lessons, submit work, and strengthen your understanding with guided practice.</p><Link className="text-action" to="/register?role=STUDENT">Start learning <ArrowRight size={16} /></Link></div>
      <div><h3>For teachers</h3><p>Organize lessons, publish assessments, review submissions, and support your classes.</p><Link className="text-action" to="/login?role=TEACHER">Open your workspace <ArrowRight size={16} /></Link></div>
    </section>
  </PublicLayout>;
}
