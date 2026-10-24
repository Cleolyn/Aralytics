import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SignUp } from '@clerk/react';
import PublicLayout from '../components/PublicLayout';
import { Notice } from '../components/ui/Feedback';
import { useAuth, PENDING_ROLE_KEY } from '../context/AuthContext';

export default function RegisterPage() {
  const { authError, clearAuthError } = useAuth();
  const [searchParams] = useSearchParams();
  const initialRole =
    searchParams.get('role') === 'TEACHER'
      ? 'TEACHER'
      : sessionStorage.getItem(PENDING_ROLE_KEY) === 'TEACHER'
      ? 'TEACHER'
      : 'STUDENT';
  const [selectedRole, setSelectedRole] = useState(initialRole);

  useEffect(() => {
    sessionStorage.setItem(PENDING_ROLE_KEY, selectedRole);
  }, [selectedRole]);

  const handleTabChange = (role) => {
    clearAuthError?.();
    setSelectedRole(role);
  };

  return (
    <PublicLayout simple>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="eyebrow">Araling Panlipunan</span>
          <h1 style={{ marginTop: 20 }}>Your learning journey starts here.</h1>
          <p>Para sa mas malawak na pag-unawa at mas magandang komunidad.</p>
          <img src="/images/community-learning.jpg" alt="" width="1774" height="887" />
        </section>
        <section className="auth-form clerk-embed">
          <div className="tabs" role="tablist" aria-label="Choose account type" style={{ marginBottom: 20 }}>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'STUDENT'}
              className={selectedRole === 'STUDENT' ? 'active' : ''}
              onClick={() => handleTabChange('STUDENT')}
            >
              Learner Account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'TEACHER'}
              className={selectedRole === 'TEACHER' ? 'active' : ''}
              onClick={() => handleTabChange('TEACHER')}
            >
              Teacher Account
            </button>
          </div>
          <Notice error>{authError}</Notice>
          <SignUp
            routing="path"
            path="/register"
            signInUrl={`/login?role=${selectedRole}`}
            forceRedirectUrl={selectedRole === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard'}
          />
        </section>
      </div>
    </PublicLayout>
  );
}
