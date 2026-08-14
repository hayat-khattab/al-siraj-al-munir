import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Splash from './components/Splash';
import AdminScreen from './screens/AdminScreen';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import QuestionScreen from './screens/QuestionScreen';

function Protected({ children }: { children: ReactNode }) {
  const { user, loaded } = useAuth();
  if (!loaded) return <div className="splash"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loaded } = useAuth();
  if (!loaded) return <div className="splash"><div className="spinner" /></div>;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { refresh } = useAuth();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route
        path="/auth"
        element={
          <RedirectIfAuthed>
            <AuthScreen />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/home"
        element={
          <Protected>
            <HomeScreen />
          </Protected>
        }
      />
      <Route
        path="/question/:id"
        element={
          <Protected>
            <QuestionScreen />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminScreen />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}