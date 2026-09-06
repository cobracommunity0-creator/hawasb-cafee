import React, { useState } from 'react';
import { useCart } from '../hooks/useCart';
import { QuickCashInput } from './QuickCashInput';
import { ShoppingBag, Trash2, User, LogOut } from 'lucide-react';
import Swal from 'sweetalert2';

export const PosLayout = ({ BACKEND_URL, activeShift, user, onLogout }) => {
  const { cart, addToCart, removeFromCart, clearCart, total } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState('');
  const [orderType, setOrderType] = useState('standard');

  // منتجات تجريبية للواجهة
  const sampleProducts = [
    { id: 1, name: 'إسبريسو (Espresso)', base_price: 35.0, variants: [] },
    { 
      id: 2, 
      name: 'لاتيه (Caffe Latte)', 
      base_price: 55.0, 
      variants: [
        { id: 1, variant_name: 'وسط (Medium)', price: 55.0, cost: 18.5 },
        { id: 2, variant_name: 'كبير (Large)', price: 65.0, cost: 24.0 }
      ] 
    },
    { 
      id: 3, 
      name: 'آيس لاتيه فانيليا', 
      base_price: 65.0, 
      variants: [
        { id: 3, variant_name: 'كبير (Large)', price: 65.0, cost: 27.0 }
      ] 
    },
    { id: 4, name: 'مولتن كيك', base_price: 60.0, variants: [] }
  ];

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    setIsSubmitting(true);
    const idempotencyKey = `${activeShift.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const res = await fetch(`${BACKEND_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          shiftId: activeShift.id,
          userId: user.id,
          items: cart,
          orderType,
          paidAmount: parseFloat(paidAmount) || total,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        const change = (parseFloat(paidAmount || total) - total).toFixed(2);
        Swal.fire({
          icon: 'success',
          title: 'تم إتمام الطلب بنجاح',
          text: `المبلغ المتبقي (الباكي): ${change} ج.م`,
          timer: 3000,
        });
        clearCart();
        setIsCheckoutOpen(false);
      } else {
        Swal.fire('خطأ', data.error || 'فشل إتمام العملية', 'error');
      }
    } catch (err) {
      Swal.fire('خطأ', 'حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* شبكة المنتجات */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-gray-800">حواسب كافيه - POS</h1>
            <p className="text-sm text-gray-500">المستخدم: {user.name} ({user.role})</p>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl hover:bg-red-100 transition">
            <LogOut size={18} />
            خروج
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {sampleProducts.map((product) => (
            <div key={product.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-lg mb-1">{product.name}</h3>
                <p className="text-blue-600 font-semibold mb-3">{product.base_price} ج.م</p>
              </div>

              {product.variants.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs text-gray-400 block">اختر الحجم:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {product.variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => addToCart(product, v)}
                        className="bg-blue-50 text-blue-700 text-xs py-2 px-1 rounded-lg hover:bg-blue-100 font-medium transition"
                      >
                        {v.variant_name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => addToCart(product)}
                  className="w-full bg-blue-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition"
                >
                  إضافة للسلة
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* سلة المشتريات Side Cart */}
      <div className="w-96 bg-white shadow-xl flex flex-col p-6 border-r border-gray-100">
        <div className="flex items-center gap-2 border-b pb-4 mb-4">
          <ShoppingBag className="text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800">تفاصيل الفاتورة</h2>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {cart.length === 0 ? (
            <p className="text-center text-gray-400 my-10">السلة فارغة حالياً</p>
          ) : (
            cart.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-bold text-gray-800 text-sm">
                    {item.name} {item.variantName && `(${item.variantName})`}
                  </p>
                  <p className="text-xs text-gray-500">{item.quantity} × {item.price} ج.م</p>
                </div>
                <button onClick={() => removeFromCart(index)} className="text-red-500 hover:bg-red-50 p-1 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t pt-4 space-y-3 mt-auto">
          <div className="flex justify-between text-xl font-bold text-gray-800">
            <span>الإجمالي:</span>
            <span>{total.toFixed(2)} ج.م</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setOrderType('standard')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border ${orderType === 'standard' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-gray-50 text-gray-600'}`}
            >
              طلب زبون
            </button>
            <button
              onClick={() => setOrderType('staff')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border ${orderType === 'staff' ? 'bg-purple-50 border-purple-500 text-purple-600' : 'bg-gray-50 text-gray-600'}`}
            >
              طلب موظف (بالتكلفة)
            </button>
          </div>

          <button
            disabled={cart.length === 0 || isSubmitting}
            onClick={() => {
              setPaidAmount(total.toString());
              setIsCheckoutOpen(true);
            }}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-green-100 transition"
          >
            تأكيد وصرف
          </button>
        </div>
      </div>

      {/* Modal التأكيد والدفع */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4">
            <h3 className="text-xl font-bold text-gray-800">إتمام عملية الدفع</h3>
            <QuickCashInput total={total} paidAmount={paidAmount} setPaidAmount={setPaidAmount} />
            <div className="flex gap-2 pt-2">
              <button
                disabled={isSubmitting}
                onClick={handleCheckout}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-blue-700 transition"
              >
                {isSubmitting ? 'جاري التنفيذ...' : 'تأكيد الدفع'}
              </button>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="bg-gray-100 text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-200 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};