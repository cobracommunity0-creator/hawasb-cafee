import React, { useState } from 'react';
import { LoginModal } from './components/LoginModal';
import { PosLayout } from './components/PosLayout';

// استبدل هذا الرابط برابط سيرفر الـ Backend الخارجي الخاص بك على Render
const BACKEND_URL = 'https://hawasb-backend.onrender.com';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeShift, setActiveShift] = useState(null);

  const handleLoginSuccess = (data) => {
    setUser(data.user);
    // إذا لم يكن هناك شيفت مفتوح، ننشئ شيفت تلقائي تجريبي
    setActiveShift(data.activeShift || { id: 1 });
  };

  const handleLogout = () => {
    setUser(null);
    setActiveShift(null);
  };

  return (
    <div>
      {!user ? (
        <LoginModal BACKEND_URL={BACKEND_URL} onLoginSuccess={handleLoginSuccess} />
      ) : (
        <PosLayout 
          BACKEND_URL={BACKEND_URL} 
          activeShift={activeShift} 
          user={user} 
          onLogout={handleLogout} 
        />
      )}
    </div>
  );
}