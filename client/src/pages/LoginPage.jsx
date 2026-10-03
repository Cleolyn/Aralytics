import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Flame, Shield, GraduationCap, ArrowRight, AlertCircle, Lock, User, Sparkles } from 'lucide-react';

/**
 * Single Sign-In & Login Interface Component (FR-01, FR-02)
 * Zapier Design System: Warm-cream canvas (#fffefb) + Deep coffee-ink (#201515) + Saturated Orange (#ff4f00)
 */
export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL'); // 'ALL' | 'TEACHER' | 'STUDENT'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(location?.state?.unauthorizedNotice || '');

  // Redirect if already authenticated
  React.useEffect(() => {
    if (user) {
      if (user.role === 'TEACHER') {
        navigate('/teacher/dashboard', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(
        identifier,
        password,
        selectedRole !== 'ALL' ? selectedRole : undefined
      );

      if (res && res.success) {
        const targetRole = res.user?.role || (res.token ? JSON.parse(atob(res.token.split('.')[1])).role : null);
        if (targetRole === 'TEACHER') {
          navigate('/teacher/dashboard', { replace: true });
        } else {
          navigate('/student/dashboard', { replace: true });
        }
      }
    } catch (err) {
      setError(err.message || 'Maling kredensyal. Paki-suri ang iyong email/LRN at password.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (id, pass, role) => {
    setIdentifier(id);
    setPassword(pass);
    setSelectedRole(role);
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      position: 'relative',
      backgroundColor: 'var(--colors-canvas)',
      backgroundImage: 'radial-gradient(at 100% 0%, rgba(248, 244, 240, 0.9) 0px, transparent 55%), radial-gradient(at 0% 100%, rgba(248, 244, 240, 0.9) 0px, transparent 55%)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: '#ffffff',
        border: '1px solid var(--border-glass)',
        borderRadius: 'var(--rounded-md)',
        padding: '40px 32px',
        boxShadow: 'var(--shadow-md)'
      }}>
        
        {/* Brand Header with Torch Icon */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            margin: '0 auto 16px',
            borderRadius: 'var(--rounded-md)',
            backgroundColor: 'var(--colors-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--colors-primary)'
          }}>
            <Flame size={32} />
          </div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 500,
            fontFamily: 'var(--font-display)',
            color: 'var(--colors-ink)',
            marginBottom: '4px',
            letterSpacing: '-0.02em'
          }}>
            Aralytics
          </h1>
          <p style={{ fontSize: '0.92rem', color: 'var(--colors-body)', lineHeight: 1.4 }}>
            Ponce AP10 Learning Hub & Assessment Engine
          </p>
          <div style={{ marginTop: '10px' }}>
            <span className="badge badge-ilaw-assessment" style={{ fontSize: '0.72rem', padding: '3px 10px' }}>
              DepEd AP10 • ILAW Framework Aligned
            </span>
          </div>
        </div>

        {/* Error Feedback Alert Banner */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: 'var(--rounded-md)',
            fontSize: '0.88rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            lineHeight: 1.45
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{error}</div>
          </div>
        )}

        {/* Role Selector Tabs (FR-01) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          backgroundColor: 'var(--colors-canvas-soft)',
          padding: '4px',
          borderRadius: 'var(--rounded-md)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '22px'
        }}>
          <button
            type="button"
            onClick={() => setSelectedRole('ALL')}
            style={{
              padding: '8px 4px',
              borderRadius: 'var(--rounded-sm)',
              border: 'none',
              backgroundColor: selectedRole === 'ALL' ? '#ffffff' : 'transparent',
              color: selectedRole === 'ALL' ? 'var(--colors-ink)' : 'var(--colors-body)',
              fontSize: '0.8rem',
              fontWeight: selectedRole === 'ALL' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: selectedRole === 'ALL' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            Auto-Detect
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('TEACHER')}
            style={{
              padding: '8px 4px',
              borderRadius: 'var(--rounded-sm)',
              border: 'none',
              backgroundColor: selectedRole === 'TEACHER' ? '#ffffff' : 'transparent',
              color: selectedRole === 'TEACHER' ? 'var(--colors-primary)' : 'var(--colors-body)',
              fontSize: '0.8rem',
              fontWeight: selectedRole === 'TEACHER' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              boxShadow: selectedRole === 'TEACHER' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <Shield size={12} /> Guro
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('STUDENT')}
            style={{
              padding: '8px 4px',
              borderRadius: 'var(--rounded-sm)',
              border: 'none',
              backgroundColor: selectedRole === 'STUDENT' ? '#ffffff' : 'transparent',
              color: selectedRole === 'STUDENT' ? 'var(--colors-ink)' : 'var(--colors-body)',
              fontSize: '0.8rem',
              fontWeight: selectedRole === 'STUDENT' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              boxShadow: selectedRole === 'STUDENT' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <GraduationCap size={13} /> Mag-aaral
          </button>
        </div>

        {/* Main Authentication Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.84rem',
              fontWeight: 600,
              color: 'var(--colors-ink)',
              marginBottom: '6px'
            }}>
              <User size={14} /> Email / LRN / Employee ID
            </label>
            <input
              type="text"
              className="form-input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. teacher@ap10.edu.ph o 123456789101"
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.84rem',
              fontWeight: 600,
              color: 'var(--colors-ink)',
              marginBottom: '6px'
            }}>
              <Lock size={14} /> Password
            </label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px 24px', fontSize: '1rem' }}
            disabled={loading}
          >
            {loading ? 'Sinisuri ang Pagkakakilanlan...' : 'Mag-login sa Aralytics'} <ArrowRight size={16} />
          </button>
        </form>

        {/* Fast Demo Credentials Quick-Select (FR-01 Seeding Test Helper) */}
        <div style={{
          marginTop: '28px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-subtle)'
        }}>
          <div style={{
            fontSize: '0.74rem',
            color: 'var(--colors-body-mid)',
            textAlign: 'center',
            marginBottom: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            <Sparkles size={13} color="var(--colors-primary)" /> Subukan ang Default Test Accounts
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* Teacher Fast Fill */}
            <button
              type="button"
              onClick={() => fillDemoAccount('teacher@ap10.edu.ph', 'Teacher123!', 'TEACHER')}
              className="btn btn-tertiary btn-sm"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '8px 10px',
                textAlign: 'left',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--colors-canvas-soft)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--colors-primary)', fontSize: '0.78rem', fontWeight: 600 }}>
                <Shield size={13} /> Guro (Cleo Ponce)
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--colors-body-mid)' }}>teacher@ap10.edu.ph</span>
            </button>

            {/* Student 1 Fast Fill */}
            <button
              type="button"
              onClick={() => fillDemoAccount('student1@ap10.edu.ph', 'Student123!', 'STUDENT')}
              className="btn btn-tertiary btn-sm"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '8px 10px',
                textAlign: 'left',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--colors-canvas-soft)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--colors-ink)', fontSize: '0.78rem', fontWeight: 600 }}>
                <GraduationCap size={13} /> Juan (10-Rizal)
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--colors-body-mid)' }}>student1@ap10.edu.ph</span>
            </button>

            {/* Student 2 Fast Fill */}
            <button
              type="button"
              onClick={() => fillDemoAccount('student2@ap10.edu.ph', 'Student123!', 'STUDENT')}
              className="btn btn-tertiary btn-sm"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '8px 10px',
                textAlign: 'left',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--colors-canvas-soft)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--colors-ink)', fontSize: '0.78rem', fontWeight: 600 }}>
                <GraduationCap size={13} /> Maria (10-Bonifacio)
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--colors-body-mid)' }}>student2@ap10.edu.ph</span>
            </button>

            {/* Student 3 Fast Fill */}
            <button
              type="button"
              onClick={() => fillDemoAccount('student3@ap10.edu.ph', 'Student123!', 'STUDENT')}
              className="btn btn-tertiary btn-sm"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '8px 10px',
                textAlign: 'left',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--colors-canvas-soft)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--colors-ink)', fontSize: '0.78rem', fontWeight: 600 }}>
                <GraduationCap size={13} /> Andres (10-Luna)
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--colors-body-mid)' }}>student3@ap10.edu.ph</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
