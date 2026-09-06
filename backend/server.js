import express from 'express';
import cors from 'cors';
import pool, { initDB } from './db.js';
import { convertUnit } from './unitConverter.js';

const app = express();
app.use(cors());
app.use(express.json());

// 1. تسجيل الدخول بالـ PIN
app.post('/api/login', async (req, res) => {
  const { pin } = req.body;
  try {
    const userRes = await pool.query('SELECT id, name, role FROM users WHERE pin = $1', [pin]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: 'الرقم السري غير صحيح' });
    }
    const user = userRes.rows[0];
    
    const shiftRes = await pool.query(
      'SELECT * FROM shifts WHERE user_id = $1 AND status = $2',
      [user.id, 'open']
    );

    res.json({
      user,
      activeShift: shiftRes.rows[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. فتح وردية جديدة (Shift)
app.post('/api/shifts/open', async (req, res) => {
  const { userId, startingCash } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO shifts (user_id, starting_cash, status) VALUES ($1, $2, $3) RETURNING *',
      [userId, startingCash, 'open']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. إتمام عملية الشراء والخصم من المخزون (Checkout API)
app.post('/api/checkout', async (req, res) => {
  const { idempotencyKey, shiftId, userId, items, orderType, paidAmount } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // حماية منع تكرار العملية
    const checkIdempotency = await client.query(
      'SELECT * FROM orders WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (checkIdempotency.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(200).json({ message: 'تم تنفيذ هذا الطلب بالفعل', order: checkIdempotency.rows[0] });
    }

    let calculatedTotal = 0;
    let calculatedCOGS = 0;

    for (const item of items) {
      const { productId, variantId, quantity } = item;
      
      let price = 0;
      let cost = 0;

      if (variantId) {
        const vRes = await client.query('SELECT price, cost FROM product_variants WHERE id = $1', [variantId]);
        price = parseFloat(vRes.rows[0].price);
        cost = parseFloat(vRes.rows[0].cost);
      } else {
        const pRes = await client.query('SELECT base_price FROM products WHERE id = $1', [productId]);
        price = parseFloat(pRes.rows[0].base_price);
      }

      const unitPrice = orderType === 'staff' ? cost : price;
      calculatedTotal += unitPrice * quantity;
      calculatedCOGS += cost * quantity;

      // خصم مكونات الوصفة مع تحويل الوحدات
      const recipeRes = await client.query(
        `SELECT pr.*, ri.base_unit, ri.stock_quantity 
         FROM product_recipes pr 
         JOIN raw_ingredients ri ON pr.ingredient_id = ri.id 
         WHERE pr.product_id = $1 AND (pr.variant_id = $2 OR pr.variant_id IS NULL)`,
        [productId, variantId || null]
      );

      for (const recipeItem of recipeRes.rows) {
        const requiredAmountInRecipeUnit = recipeItem.quantity * quantity;
        const deductAmountInBaseUnit = convertUnit(
          requiredAmountInRecipeUnit, 
          recipeItem.recipe_unit, 
          recipeItem.base_unit
        );

        await client.query(
          'UPDATE raw_ingredients SET stock_quantity = stock_quantity - $1 WHERE id = $2',
          [deductAmountInBaseUnit, recipeItem.ingredient_id]
        );
      }
    }

    const tipAmount = Math.max(0, paidAmount - calculatedTotal);

    const orderRes = await client.query(
      `INSERT INTO orders (shift_id, user_id, idempotency_key, order_type, total_amount, paid_amount, tip_amount, cogs_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [shiftId, userId, idempotencyKey, orderType, calculatedTotal, paidAmount, tipAmount, calculatedCOGS]
    );

    const orderId = orderRes.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.productId, item.variantId || null, item.quantity, item.price, item.cost || 0]
      );
    }

    await client.query(
      `UPDATE shifts SET 
        total_sales = total_sales + $1,
        total_cogs = total_cogs + $2,
        total_tips = total_tips + $3
       WHERE id = $4`,
      [calculatedTotal, calculatedCOGS, tipAmount, shiftId]
    );

    await client.query('COMMIT');
    res.json({ success: true, order: orderRes.rows[0] });

  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// تشغيل السيرفر وبناء القاعدة
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  if (process.env.DATABASE_URL) {
    await initDB();
  }
  console.log(`Server running on port ${PORT}`);
});