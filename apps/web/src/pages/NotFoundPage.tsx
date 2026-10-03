import { Link } from 'react-router-dom';

/**
 * Shown for any unknown route. Plain, typography-driven — no marketing speak.
 */
export function NotFoundPage(): JSX.Element {
  return (
    <div className="not-found">
      <h1>404</h1>
      <p className="muted">That page does not exist.</p>
      <p>
        <Link to="/dashboard" className="link">Back to dashboard</Link>
      </p>
    </div>
  );
}