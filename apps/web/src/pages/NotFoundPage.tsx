import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useMeta } from '../lib/use-meta';

/**
 * Shown for any unknown route. Plain, typography-driven — no marketing speak.
 */
export function NotFoundPage(): JSX.Element {
  useMeta({
    title: '404 — Page not found',
    description: 'The page you are looking for does not exist on DEPLOX.',
    noindex: true,
  });
  return (
    <div className="not-found">
      <div className="not-found-brand"><Logo size={32} /></div>
      <h1>404</h1>
      <p className="muted">That page does not exist.</p>
      <p>
        <Link to="/dashboard" className="link">Back to dashboard</Link>
      </p>
    </div>
  );
}