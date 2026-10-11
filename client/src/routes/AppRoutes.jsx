import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoginPage from '../pages/LoginPage';
import ProtectedRoute from '../components/ProtectedRoute';
import StudentDashboard from '../pages/StudentDashboard';
import TeacherDashboard from '../pages/TeacherDashboard';
import MaterialsHub from '../pages/MaterialsHub';
import QuizRunner from '../pages/QuizRunner';
import QuizManager from '../pages/QuizManager';
import RemedialCenter from '../pages/RemedialCenter';

export { ProtectedRoute };

/**
 * Teacher Workspace Layout (Dynamic Navigation Isolation)
 */
function TeacherLayout({ children, currentTab }) {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab === 'dashboard') navigate('/teacher/dashboard');
          else if (tab === 'gradebook') navigate('/teacher/gradebook');
          else if (tab === 'quiz_creator') navigate('/teacher/quizzes/create');
          else if (tab === 'materials') navigate('/teacher/materials');
          else if (tab === 'remedial') navigate('/teacher/remediation');
        }}
      />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

/**
 * Student Workspace Layout (Dynamic Navigation Isolation)
 */
function StudentLayout({ children, currentTab }) {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab === 'student_home') navigate('/student/dashboard');
          else if (tab === 'materials') navigate('/student/materials');
          else if (tab === 'remedial') navigate('/student/interventions');
        }}
      />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

/**
 * Quiz Runner Wrapper extracting quiz ID from URL params
 */
function QuizRunnerRoute() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <QuizRunner
      quizId={id}
      onBackToDashboard={() => navigate('/student/dashboard')}
      onNavigateToRemedial={() => navigate('/student/interventions')}
    />
  );
}

/**
 * Master AppRoutes Configuration (Strict Unswitchable Role Routing)
 */
export default function AppRoutes() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--colors-canvas)',
        color: 'var(--colors-body)',
        fontFamily: 'var(--font-body)'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(255, 79, 0, 0.2)',
          borderTopColor: 'var(--colors-primary)',
          borderRadius: '50%',
          animation: 'aralytics-spin 1s linear infinite',
          marginBottom: '16px'
        }} />
        <style>{`@keyframes aralytics-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--colors-ink)' }}>
          Inihahanda ang Aralytics Platform...
        </span>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Login Route */}
      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              to={user.role === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard'}
              replace
            />
          ) : (
            <LoginPage />
          )
        }
      />

      {/* Root Path Redirect */}
      <Route
        path="/"
        element={
          <Navigate
            to={
              !user
                ? '/login'
                : user.role === 'TEACHER'
                ? '/teacher/dashboard'
                : '/student/dashboard'
            }
            replace
          />
        }
      />

      {/* ====================================================================
          STRICT TEACHER ROUTE TREE (/teacher/*)
          Guarded by ProtectedRoute role="TEACHER"
          ==================================================================== */}
      <Route
        path="/teacher/dashboard"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherLayout currentTab="dashboard">
              <TeacherDashboard
                onNavigateToCreator={() => navigate('/teacher/quizzes/create')}
                onNavigateToRemedial={() => navigate('/teacher/remediation')}
              />
            </TeacherLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/teacher/gradebook"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherLayout currentTab="gradebook">
              <TeacherDashboard
                onNavigateToCreator={() => navigate('/teacher/quizzes/create')}
                onNavigateToRemedial={() => navigate('/teacher/remediation')}
              />
            </TeacherLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/teacher/quizzes/create"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherLayout currentTab="quiz_creator">
              <QuizManager onQuizCreated={() => navigate('/teacher/dashboard')} />
            </TeacherLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/teacher/materials"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherLayout currentTab="materials">
              <MaterialsHub />
            </TeacherLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/teacher/remediation"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherLayout currentTab="remedial">
              <RemedialCenter onNavigateToMaterials={() => navigate('/teacher/materials')} />
            </TeacherLayout>
          </ProtectedRoute>
        }
      />

      {/* ====================================================================
          STRICT STUDENT ROUTE TREE (/student/*)
          Guarded by ProtectedRoute role="STUDENT"
          ==================================================================== */}
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentLayout currentTab="student_home">
              <StudentDashboard
                onSelectQuiz={(qId) => navigate(`/student/quizzes/${qId}`)}
                onNavigateToRemedial={() => navigate('/student/interventions')}
                onNavigateToMaterials={() => navigate('/student/materials')}
              />
            </StudentLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/materials"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentLayout currentTab="materials">
              <MaterialsHub />
            </StudentLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/interventions"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentLayout currentTab="remedial">
              <RemedialCenter
                onNavigateToMaterials={() => navigate('/student/materials')}
                onSelectQuiz={(qId) => navigate(`/student/quizzes/${qId}`)}
              />
            </StudentLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/quizzes/:id"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentLayout currentTab="student_home">
              <QuizRunnerRoute />
            </StudentLayout>
          </ProtectedRoute>
        }
      />

      {/* Wildcard Fallback */}
      <Route
        path="*"
        element={
          <Navigate
            to={
              !user
                ? '/login'
                : user.role === 'TEACHER'
                ? '/teacher/dashboard'
                : '/student/dashboard'
            }
            replace
          />
        }
      />
    </Routes>
  );
}
