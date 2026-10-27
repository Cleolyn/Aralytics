import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Brand from '../components/Brand';
import OfflineStatus from '../components/OfflineStatus';
import IsoLoader from '../components/iso/IsoLoader';
import useSplash from '../hooks/useSplash';
import LoginPage from '../pages/LoginPage';
import LandingPage from '../pages/LandingPage';
import RegisterPage from '../pages/RegisterPage';
import OnboardingPage from '../pages/OnboardingPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import AuthTaskPage from '../pages/AuthTaskPage';
import { accountHome as resolveAccountHome, AUTH_TASK_PATHS } from '../utils/authFlow';
import HelpPage from '../pages/HelpPage';
import ProtectedRoute from '../components/ProtectedRoute';
import StudentDashboard from '../pages/StudentDashboard';
import TeacherDashboard from '../pages/TeacherDashboard';
import TeacherOverview from '../pages/TeacherOverview';
import ClassesPage from '../pages/ClassesPage';
import AssessmentsPage from '../pages/AssessmentsPage';
import ReportsPage from '../pages/ReportsPage';
import TeacherSupportPage from '../pages/TeacherSupportPage';
import MaterialsHub from '../pages/MaterialsHub';
import LessonPage from '../pages/LessonPage';
import QuizRunner from '../pages/QuizRunner';
import QuizManager from '../pages/QuizManager';
import RemedialCenter from '../pages/RemedialCenter';
import ActivitiesPage from '../pages/ActivitiesPage';
import ProgressPage from '../pages/ProgressPage';

export { ProtectedRoute };

function AuthRouteAlias() {
  const location = useLocation();
  const path = location.pathname.replace(/^\/sign-in(?=\/|$)/, '/login').replace(/^\/sign-up(?=\/|$)/, '/register');
  return <Navigate to={path + location.search + location.hash} replace />;
}

function WorkspaceLayout({ children }) {
  return <div className="app-shell"><Navbar /><main id="main-content" tabIndex={-1}>{children}</main></div>;
}
const TeacherLayout = WorkspaceLayout;
const StudentLayout = WorkspaceLayout;

/**
 * Quiz Runner Wrapper extracting quiz ID from URL params
 */
function QuizRunnerRoute() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <QuizRunner
      key={id}
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
  const { user, loading, sessionTask } = useAuth();
  const splash = useSplash(loading);
  const location = useLocation();
  useEffect(() => {
    const labels = { dashboard: 'Overview', materials: 'Lessons', activities: 'Activities', progress: 'My progress', classes: 'Classes', assessments: 'Quizzes and tasks', gradebook: 'Gradebook', reports: 'Reports', remediation: 'Student support', interventions: 'Practice', login: 'Log in', register: 'Create account', help: 'Help', onboarding: 'Join your class' };
    const segments = location.pathname.split('/');
    document.title = `${labels[segments[2]] || labels[segments[1]] || (segments.includes('quizzes') ? 'Quiz' : 'Araling Panlipunan')} · Aralytics`;
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const navigate = useNavigate();

  // The callback must mount while Clerk completes a session or resolves a Protect challenge.
  if (/^\/sso-callback\/?$/.test(location.pathname)) return <AuthCallbackPage />;
  if (location.pathname.startsWith('/auth/tasks/')) return <AuthTaskPage />;
  if (sessionTask) return <Navigate to={AUTH_TASK_PATHS[sessionTask] || '/auth/tasks/unsupported'} replace />;

  if (splash.show) return <IsoLoader variant="page" progress={splash.progress}>Preparing Aralytics</IsoLoader>;
  if (loading) return <IsoLoader variant="page">Checking your account</IsoLoader>;

  const accountHome = resolveAccountHome(user);

  return (
    <Routes>
      <Route path="/sign-in/*" element={<AuthRouteAlias />} />
      <Route path="/sign-up/*" element={<AuthRouteAlias />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/register/*" element={user ? <Navigate to={accountHome} replace /> : <RegisterPage />} />
      <Route path="/help" element={<HelpPage />} />
      {/* Public Login Route */}
      <Route
        path="/login/*"
        element={
          user ? (
            <Navigate
              to={accountHome}
              replace
            />
          ) : (
            <LoginPage />
          )
        }
      />

      <Route path="/" element={user ? <Navigate to={accountHome} replace /> : <LandingPage />} />

      {/* ====================================================================
          STRICT TEACHER ROUTE TREE (/teacher/*)
          Guarded by ProtectedRoute role="TEACHER"
          ==================================================================== */}
      <Route
        path="/teacher/dashboard"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherLayout currentTab="dashboard">
              <TeacherOverview />
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
              <QuizManager onQuizCreated={() => navigate('/teacher/assessments')} />
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
              <TeacherSupportPage />
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
            <div><header className="workspace-header"><Brand to="/student/dashboard" /><OfflineStatus /></header><main id="main-content"><QuizRunnerRoute /></main></div>
          </ProtectedRoute>
        }
      />

      <Route path="/student/activities" element={<ProtectedRoute role="STUDENT"><StudentLayout><ActivitiesPage /></StudentLayout></ProtectedRoute>} />
      <Route path="/student/progress" element={<ProtectedRoute role="STUDENT"><StudentLayout><ProgressPage /></StudentLayout></ProtectedRoute>} />
      <Route path="/student/materials/:id" element={<ProtectedRoute role="STUDENT"><StudentLayout><LessonPage /></StudentLayout></ProtectedRoute>} />
      <Route path="/teacher/materials/:id" element={<ProtectedRoute role="TEACHER"><TeacherLayout><LessonPage /></TeacherLayout></ProtectedRoute>} />
      <Route path="/teacher/classes" element={<ProtectedRoute role="TEACHER"><TeacherLayout><ClassesPage /></TeacherLayout></ProtectedRoute>} />
      <Route path="/teacher/assessments" element={<ProtectedRoute role="TEACHER"><TeacherLayout><AssessmentsPage /></TeacherLayout></ProtectedRoute>} />
      <Route path="/teacher/reports" element={<ProtectedRoute role="TEACHER"><TeacherLayout><ReportsPage /></TeacherLayout></ProtectedRoute>} />
      {/* Wildcard Fallback */}
      <Route
        path="*"
        element={
          <Navigate
            to={accountHome}
            replace
          />
        }
      />
    </Routes>
  );
}
