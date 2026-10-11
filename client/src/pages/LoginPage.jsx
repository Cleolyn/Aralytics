import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PublicLayout from '../components/PublicLayout';
import { Notice } from '../components/ui/Feedback';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(location.state?.unauthorizedNotice || '');
  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await login(identifier.trim(), password);
      if (!res.success) throw new Error(res.message || 'Please check your account details.');
      navigate(res.user.role === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard', { replace: true });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return <PublicLayout simple><div className="auth-layout">
    <section className="auth-story"><span className="eyebrow">Your learning journey</span><h1 style={{ marginTop: 20 }}>Welcome back.</h1><p>Tuloy ang pagkatuto. Explore our world, one lesson at a time.</p><img src="/images/community-learning.png" alt="" width="1774" height="887" /></section>
    <section className="auth-form"><h1>Log in to Aralytics</h1><p>Use your school account to continue.</p><Notice error>{error}</Notice>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="identifier">Email or school ID</label><input id="identifier" className="form-input" value={identifier} onChange={e => setIdentifier(e.target.value)} required autoComplete="username" placeholder="Email, LRN, or employee ID" /></div>
        <div className="field"><label htmlFor="password">Password</label><div className="password-field"><input id="password" className="form-input" type={visible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></div>
        <p style={{ textAlign: 'right', marginBottom: 24, fontSize: 14 }}><Link to="/help#login">Need help logging in?</Link></p>
        <button className="btn btn-primary full-width" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}<ArrowRight size={17} /></button>
      </form>
      <p className="auth-foot">New here? <Link to="/register">Create an account</Link></p>
      {import.meta.env.DEV && <details className="auth-foot"><summary>Try a local demo account</summary><div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}><button className="text-action" onClick={() => { setIdentifier('teacher@ap10.edu.ph'); setPassword('Teacher123!'); }}>Teacher demo</button><button className="text-action" onClick={() => { setIdentifier('student1@ap10.edu.ph'); setPassword('Student123!'); }}>Learner demo</button></div><small>Demo accounts are available after seeding local users.</small></details>}
    </section>
  </div></PublicLayout>;
}
