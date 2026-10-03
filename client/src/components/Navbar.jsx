import React from 'react';
import { useAuth } from '../context/AuthContext';
import OfflineStatus from './OfflineStatus';
import { 
  BookOpen, 
  CheckSquare, 
  ArrowRightCircle, 
  LayoutDashboard, 
  FileSpreadsheet, 
  PlusCircle, 
  LogOut, 
  Flame
} from 'lucide-react';

export default function Navbar({ currentTab, setCurrentTab }) {
  const { user, isTeacher, logout } = useAuth();

  return (
    <header style={{
      background: 'var(--colors-canvas)',
      borderBottom: '1px solid var(--border-glass)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px' }}>
        
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setCurrentTab(isTeacher ? 'dashboard' : 'student_home')}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--rounded-md)',
            background: 'var(--colors-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--colors-primary)'
          }}>
            <Flame size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.3rem', letterSpacing: '-0.02em', color: 'var(--colors-ink)' }}>
                Aralytics
              </span>
              <span className="badge badge-ilaw-assessment" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                ILAW ENGINE
              </span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)' }}>
              Ponce AP10 Learning Hub
            </div>
          </div>
        </div>

        {/* Dynamic Navigation according to Role */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isTeacher ? (
            <>
              <button
                className={`btn btn-sm ${currentTab === 'dashboard' ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setCurrentTab('dashboard')}
              >
                <LayoutDashboard size={15} /> Dashboard & Proctoring
              </button>
              <button
                className={`btn btn-sm ${currentTab === 'gradebook' ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setCurrentTab('gradebook')}
              >
                <FileSpreadsheet size={15} /> Master Gradebook
              </button>
              <button
                className={`btn btn-sm ${currentTab === 'quiz_creator' ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setCurrentTab('quiz_creator')}
              >
                <PlusCircle size={15} /> Create Assessment
              </button>
              <button
                className={`btn btn-sm ${currentTab === 'materials' ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setCurrentTab('materials')}
              >
                <BookOpen size={15} /> Materials Hub
              </button>
            </>
          ) : (
            <>
              <button
                className={`btn btn-sm ${currentTab === 'student_home' ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setCurrentTab('student_home')}
              >
                <CheckSquare size={15} /> My Assessments
              </button>
              <button
                className={`btn btn-sm ${currentTab === 'materials' ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setCurrentTab('materials')}
              >
                <BookOpen size={15} /> Learning Hub (Offline)
              </button>
              <button
                className={`btn btn-sm ${currentTab === 'remedial' ? 'btn-primary' : 'btn-tertiary'}`}
                onClick={() => setCurrentTab('remedial')}
              >
                <ArrowRightCircle size={15} /> Ways Forward
              </button>
            </>
          )}
        </nav>

        {/* Right Action Tools: Online Status & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <OfflineStatus />

          {/* User Profile Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: 'var(--rounded-md)',
              background: 'var(--colors-ink)',
              color: 'var(--colors-on-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '0.88rem'
            }}>
              {user?.first_name?.[0] || 'U'}
            </div>
            <div style={{ display: 'none', md: 'block' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--colors-ink)', lineHeight: 1.1 }}>
                {user?.first_name} {user?.last_name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--colors-body-mid)' }}>
                {isTeacher ? 'AP10 Coordinator' : `Section ${user?.section || '10-Rizal'}`}
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--colors-body)',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: 'var(--rounded-sm)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--colors-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--colors-body)'}
            >
              <LogOut size={16} />
            </button>
          </div>

        </div>

      </div>
    </header>
  );
}
