import { useState, useEffect } from 'react';

export const useCart = () => {
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('hawasb_cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('hawasb_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product, variant = null) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === product.id && item.variantId === (variant?.id || null)
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          variantId: variant?.id || null,
          variantName: variant?.variant_name || null,
          price: parseFloat(variant ? variant.price : product.base_price),
          cost: parseFloat(variant ? variant.cost : 0),
          quantity: 1,
        },
      ];
    });
  };

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => setCart([]);

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return { cart, addToCart, removeFromCart, clearCart, total };
};