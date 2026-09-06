import React, { useRef, useEffect } from 'react';

export const QuickCashInput = ({ total, paidAmount, setPaidAmount }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const addPreset = (amount) => {
    const current = parseFloat(paidAmount) || 0;
    setPaidAmount((current + amount).toString());
  };

  return (
    <div className="space-y-4 text-right">
      <label className="block text-sm font-semibold text-gray-700">المبلغ المدفوع (جنيه)</label>
      <input
        ref={inputRef}
        type="number"
        value={paidAmount}
        onChange={(e) => setPaidAmount(e.target.value)}
        className="w-full text-3xl text-center border-2 border-blue-500 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-300 font-bold text-gray-800"
      />

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setPaidAmount(total.toString())}
          className="bg-green-600 text-white p-3 rounded-xl text-sm font-bold hover:bg-green-700 transition"
        >
          المبلغ بالضبط
        </button>
        <button
          type="button"
          onClick={() => addPreset(50)}
          className="bg-gray-100 p-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-200 transition"
        >
          +50 ج.م
        </button>
        <button
          type="button"
          onClick={() => addPreset(100)}
          className="bg-gray-100 p-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-200 transition"
        >
          +100 ج.م
        </button>
      </div>
    </div>
  );
};