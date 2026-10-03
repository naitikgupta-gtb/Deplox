import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { User } from '@deplox/shared-types';
import { fetchMe } from './lib/api';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewProjectPage } from './pages/NewProjectPage';
import { ProjectPage } from './pages/ProjectPage';
import { DeploymentPage } from './pages/DeploymentPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <Layout user={user}>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route
          path="/dashboard"
          element={user ? <DashboardPage user={user} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/new"
          element={user ? <NewProjectPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/projects/:projectId"
          element={user ? <ProjectPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/projects/:projectId/deployments/:deploymentId"
          element={user ? <DeploymentPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={user ? <NotFoundPage /> : <Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}