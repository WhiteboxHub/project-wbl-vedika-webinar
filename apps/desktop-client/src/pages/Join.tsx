import { Navigate, useParams } from 'react-router-dom';

// Join page now simply redirects to the unified WaitingRoom
// which handles both the name entry + waiting/auto-join logic
export default function Join() {
  const { token } = useParams<{ token: string }>();
  if (!token) return <Navigate to="/" replace />;
  return <Navigate to={`/waiting/${token}`} replace />;
}
