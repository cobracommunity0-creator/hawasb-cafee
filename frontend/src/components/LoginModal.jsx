import React, { useState } from 'react';
import Swal from 'sweetalert2';

export const LoginModal = ({ BACKEND_URL, onLoginSuccess }) => {
  const [pin, setPin] = useState('');

  const handleKeyPress = (val) => {
    if (pin.length < 4) setPin((prev) => prev + val);
  };

  const handleSubmit = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (res.ok) {
        onLoginSuccess(data);
      } else {
        Swal.fire('خطأ', data.message || 'الرقم السري غير صحيح', 'error');
        setPin('');
      }
    } catch (err) {
      Swal.fire('خطأ', 'فشل الاتصال بالسيرفر', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-2xl w-full max-w-xs text-center shadow-2xl">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">حواسب كافيه</h2>
        <p className="text-sm text-gray-500 mb-4">أدخل الرقم السري للفتح</p>
        <input
          type="password"
          readOnly
          value={pin}
          className="w-full text-center text-3xl tracking-widest border-2 border-gray-300 p-2 rounded-xl mb-4 bg-gray-50"
        />
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((btn) => (
            <button
              key={btn}
              onClick={() => {
                if (btn === 'C') setPin('');
                else if (btn === 'OK') handleSubmit();
                else handleKeyPress(btn.toString());
              }}
              className="p-4 bg-gray-100 text-gray-800 font-bold text-xl rounded-xl hover:bg-blue-500 hover:text-white transition active:scale-95"
            >
              {btn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};