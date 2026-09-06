const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة بيانات PostgreSQL (Supabase / Render)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// إنشاء الجداول تلقائياً
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE,
                pin VARCHAR(255),
                role VARCHAR(50)
            );
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                category VARCHAR(255),
                cost_price NUMERIC DEFAULT 0,
                selling_price NUMERIC DEFAULT 0,
                stock_quantity INT DEFAULT 0,
                unit_type VARCHAR(50) DEFAULT 'قطعة',
                is_drink INT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS product_variants (
                id SERIAL PRIMARY KEY,
                product_id INT REFERENCES products(id) ON DELETE CASCADE,
                variant_name VARCHAR(255),
                selling_price NUMERIC DEFAULT 0,
                cost_price NUMERIC DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS product_ingredients (
                id SERIAL PRIMARY KEY,
                parent_product_id INT REFERENCES products(id) ON DELETE CASCADE,
                ingredient_id INT REFERENCES products(id) ON DELETE CASCADE,
                quantity_required NUMERIC
            );
            CREATE TABLE IF NOT EXISTS shifts (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id),
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                status VARCHAR(50),
                shift_date VARCHAR(50),
                notes TEXT
            );
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                shift_id INT REFERENCES shifts(id),
                product_id INT REFERENCES products(id),
                variant_name VARCHAR(255),
                quantity INT,
                unit_price NUMERIC,
                unit_cost NUMERIC,
                is_staff_order INT DEFAULT 0,
                tip_amount NUMERIC DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO users (id, username, pin, role) 
            VALUES (1, 'admin', '1234', 'admin'), (2, 'cashier', '1111', 'cashier')
            ON CONFLICT (username) DO NOTHING;
        `);
        console.log('✅ تم إعداد جداول قاعدة البيانات بنجاح.');
    } catch (err) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', err);
    }
}
initDB();

// 1. تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, pin } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1 AND pin = $2', [username, pin]);
        const user = userRes.rows[0];

        if (!user) return res.status(401).json({ message: 'بيانات غير صحيحة' });

        if (user.role === 'cashier') {
            const shiftRes = await pool.query("SELECT * FROM shifts WHERE user_id = $1 AND status = 'open'", [user.id]);
            res.json({ user, activeShift: shiftRes.rows[0] || null });
        } else {
            res.json({ user, activeShift: null });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. بدء شيفت
app.post('/api/start-shift', async (req, res) => {
    const { user_id } = req.body;
    const shiftDate = new Date().toISOString().split('T')[0];
    try {
        const result = await pool.query(
            "INSERT INTO shifts (user_id, start_time, status, shift_date) VALUES ($1, NOW(), 'open', $2) RETURNING id",
            [user_id, shiftDate]
        );
        res.json({ shift_id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. جلب الأصناف مع الأحجام والأشكال
app.get('/api/products', async (req, res) => {
    try {
        const productsRes = await pool.query(`
            SELECT p.*,
                COALESCE((
                    SELECT SUM(pi.quantity_required * ing.cost_price)
                    FROM product_ingredients pi
                    JOIN products ing ON pi.ingredient_id = ing.id
                    WHERE pi.parent_product_id = p.id
                ), 0) + COALESCE(p.cost_price, 0) as calculated_cost
            FROM products p 
            ORDER BY p.id ASC
        `);
        const variantsRes = await pool.query(`SELECT * FROM product_variants`);
        
        const products = productsRes.rows.map(p => {
            p.variants = variantsRes.rows.filter(v => v.product_id === p.id);
            return p;
        });

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. إتمام عملية البيع
app.post('/api/checkout', async (req, res) => {
    const { shift_id, items, is_staff_order, paid_amount } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let totalSales = 0;

        for (const item of items) {
            const price = is_staff_order ? item.cost_price : item.selling_price;
            totalSales += price * item.quantity;

            await client.query(
                `INSERT INTO sales (shift_id, product_id, variant_name, quantity, unit_price, unit_cost, is_staff_order, tip_amount) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [shift_id, item.id, item.variant_name || null, item.quantity, price, item.cost_price, is_staff_order ? 1 : 0, 0]
            );

            await client.query(
                `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND is_drink = 0`,
                [item.quantity, item.id]
            );
        }

        let tipAmount = 0;
        if (!is_staff_order && paid_amount > totalSales) {
            tipAmount = paid_amount - totalSales;
            if (tipAmount > 0 && items.length > 0) {
                await client.query(`UPDATE sales SET tip_amount = $1 WHERE id = (SELECT id FROM sales WHERE shift_id = $2 ORDER BY id DESC LIMIT 1)`, [tipAmount, shift_id]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'تم إتمام العملية بنجاح' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 5. جلب إحصائيات الشيفت الحالي
app.get('/api/shift-summary/:shift_id', async (req, res) => {
    try {
        const salesRes = await pool.query(`
            SELECT 
                COALESCE(SUM(quantity * unit_price), 0) as total_sales,
                COALESCE(SUM(tip_amount), 0) as total_tips
            FROM sales 
            WHERE shift_id = $1
        `, [req.params.shift_id]);

        res.json(salesRes.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. تقفيل الشيفت
app.post('/api/end-shift', async (req, res) => {
    const { shift_id, notes } = req.body;
    try {
        await pool.query("UPDATE shifts SET end_time = NOW(), status = 'closed', notes = $1 WHERE id = $2", [notes, shift_id]);
        res.json({ message: 'تم إغلاق الشيفت' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
});
