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
import Register from './pages/Register';
import TestLiveKit from './pages/TestLiveKit';
import WebinarGate from './pages/WebinarGate';
import VerifyEmail from './pages/VerifyEmail';
import { getStoredAuth } from './lib/api';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = getStoredAuth();
  if (!auth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Legacy redirect: /join/:token and /waiting/:token still work
 * but show a deprecation-style redirect through the old components.
 * /register/:id also remains for backward compatibility.
 */

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Email verification endpoint */}
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* New unified webinar entry point */}
      <Route path="/w/:slug" element={<WebinarGate />} />

      {/* Legacy routes — kept for backward compatibility */}
      <Route path="/register/:id" element={<Register />} />
      <Route path="/join/:token" element={<Join />} />
      <Route path="/waiting/:token" element={<WaitingRoom />} />

      <Route path="/class/:roomId" element={<Classroom />} />
      <Route path="/test-lk" element={<TestLiveKit />} />

      {/* Organizer Dashboard (protected) */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dashboard/new" element={<ProtectedRoute><CreateSession /></ProtectedRoute>} />
      <Route path="/dashboard/:id" element={<ProtectedRoute><SessionDetail /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
