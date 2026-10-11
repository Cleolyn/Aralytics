import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PublicLayout from '../components/PublicLayout';
import { Notice } from '../components/ui/Feedback';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', lrn_or_id: '', section: '', password: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const res = await register({ ...form, role: 'STUDENT' }); if (!res.success) throw new Error(res.message || 'Could not create your account.'); navigate('/student/dashboard', { replace: true }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <PublicLayout simple><div className="auth-layout">
    <section className="auth-story"><span className="eyebrow">Araling Panlipunan</span><h1 style={{ marginTop: 20 }}>Your learning journey starts here.</h1><p>Para sa mas malawak na pag-unawa at mas magandang komunidad.</p><img src="/images/community-learning.png" alt="" width="1774" height="887" /></section>
    <section className="auth-form"><h1>Create your account</h1><p>Join your school’s learning workspace.</p><Notice error>{error}</Notice><form onSubmit={submit}>
      <div className="form-grid">{[['first_name','First name'],['last_name','Last name']].map(([key,label]) => <div className="field" key={key}><label htmlFor={key}>{label}</label><input id={key} name={key} className="form-input" value={form[key]} onChange={change} required maxLength={80} autoComplete={key === 'first_name' ? 'given-name' : 'family-name'} /></div>)}</div>
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="form-input" value={form.email} onChange={change} required autoComplete="email" /></div>
      <div className="form-grid"><div className="field"><label htmlFor="lrn_or_id">LRN / school ID</label><input id="lrn_or_id" name="lrn_or_id" className="form-input" value={form.lrn_or_id} onChange={change} required maxLength={40} aria-describedby="school-id-help" /><small id="school-id-help" className="field-help">Use the ID given by your school.</small></div><div className="field"><label htmlFor="section">Class section</label><input id="section" name="section" className="form-input" value={form.section} onChange={change} required placeholder="e.g. 10-Rizal" maxLength={80} /></div></div>
      <div className="field"><label htmlFor="new-password">Password</label><div className="password-field"><input id="new-password" name="password" type={visible ? 'text' : 'password'} className="form-input" value={form.password} onChange={change} required minLength={8} autoComplete="new-password" aria-describedby="password-help" /><button type="button" className="icon-button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div><small id="password-help" className="field-help">Use at least 8 characters.</small></div>
      <p style={{ fontSize: 14, marginBottom: 20 }}>Use the correct school details so your teacher can find your work. <Link to="/help#account-data">How your account data is used</Link></p>
      <button className="btn btn-primary full-width" disabled={busy}>{busy ? 'Creating account…' : 'Create learner account'}<ArrowRight size={17} /></button>
    </form><p className="auth-foot">Already registered? <Link to="/login">Log in</Link></p><p className="auth-foot muted">Teachers: ask your school administrator for your teaching account.</p></section>
  </div></PublicLayout>;
}
