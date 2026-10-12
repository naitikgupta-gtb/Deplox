import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { User } from '@deplox/shared-types';
import { fetchMe } from './lib/api';
import { Layout } from './components/Layout';
import { DashboardLayout } from './components/DashboardLayout';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewProjectPage } from './pages/NewProjectPage';
import { ProjectPage } from './pages/ProjectPage';
import { DeploymentPage } from './pages/DeploymentPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PricingPage } from './pages/PricingPage';
import { FoundingMemberPage } from './pages/FoundingMemberPage';
import { BillingPage } from './pages/BillingPage';
import { DocsPage } from './pages/DocsPage';
import { StatusPage } from './pages/StatusPage';
import { ChangelogPage } from './pages/ChangelogPage';
import { AboutPage } from './pages/AboutPage';

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

  // Signed-in dashboard routes: sidebar layout.
  // Public + auth routes: simple top-nav layout.
  if (user) {
    return (
      <DashboardLayout user={user}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage user={user} />} />
          <Route path="/new" element={<NewProjectPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/deployments/:deploymentId" element={<DeploymentPage />} />
          <Route path="/billing" element={<BillingPage user={user} />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/founding" element={<FoundingMemberPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </DashboardLayout>
    );
  }

  return (
    <Layout user={user}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/new" element={<Navigate to="/" replace />} />
        <Route path="/projects/:projectId" element={<Navigate to="/" replace />} />
        <Route path="/projects/:projectId/deployments/:deploymentId" element={<Navigate to="/" replace />} />
        <Route path="/billing" element={<Navigate to="/pricing" replace />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/founding" element={<FoundingMemberPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}