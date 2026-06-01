import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateSession from './pages/CreateSession';
import SessionDetail from './pages/SessionDetail';
import Join from './pages/Join';
import WaitingRoom from './pages/WaitingRoom';
import Classroom from './pages/Classroom';
import { getStoredAuth } from './lib/api';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = getStoredAuth();
  if (!auth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/join/:token" element={<Join />} />
      <Route path="/waiting/:token" element={<WaitingRoom />} />
      <Route path="/class/:roomId" element={<Classroom />} />

      {/* Organizer Dashboard (protected) */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dashboard/new" element={<ProtectedRoute><CreateSession /></ProtectedRoute>} />
      <Route path="/dashboard/:id" element={<ProtectedRoute><SessionDetail /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
