import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Join from './pages/Join';
import Classroom from './pages/Classroom';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join/:token" element={<Join />} />
      <Route path="/class/:roomId" element={<Classroom />} />
    </Routes>
  );
}

export default App;
