import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="num text-6xl font-semibold text-fg">404</div>
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-sub">The stock or IPO you’re looking for isn’t covered yet.</p>
      <Link to="/" className="btn mt-6 bg-fg text-bg hover:opacity-90">Back to overview</Link>
    </div>
  );
}
