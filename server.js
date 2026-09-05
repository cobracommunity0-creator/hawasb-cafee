const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// الاتصال بقاعدة بيانات PostgreSQL عبر DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// تجهيز الجداول والبذور الافتراضية
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE,
                pin VARCHAR(10),
                role VARCHAR(20)
            );

            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                category VARCHAR(50),
                cost_price NUMERIC,
                selling_price NUMERIC,
                stock_quantity INTEGER DEFAULT 0,
                is_drink INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS shifts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                status VARCHAR(20),
                shift_date DATE,
                expected_cash NUMERIC DEFAULT 0,
                actual_cash NUMERIC DEFAULT 0,
                cash_difference NUMERIC DEFAULT 0,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                shift_id INTEGER REFERENCES shifts(id),
                product_id INTEGER REFERENCES products(id),
                quantity INTEGER,
                unit_price NUMERIC,
                unit_cost NUMERIC,
                discount_amount NUMERIC DEFAULT 0,
                is_staff_order INTEGER DEFAULT 0,
                tip_amount NUMERIC DEFAULT 0,
                is_refunded INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                shift_id INTEGER REFERENCES shifts(id),
                description TEXT,
                amount NUMERIC,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // إضافة المستخدمين الافتراضيين
        await pool.query(`
            INSERT INTO users (id, username, pin, role) VALUES 
            (1, 'admin', '1234', 'admin'),
            (2, 'cashier', '1111', 'cashier')
            ON CONFLICT (id) DO NOTHING;
        `);

        // بذر المنتجات إذا كان الجدول فاضي
        const prodCheck = await pool.query(`SELECT COUNT(*) FROM products`);
        if (parseInt(prodCheck.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO products (name, category, cost_price, selling_price, stock_quantity, is_drink) VALUES
                ('شاي', 'مشروبات', 5, 15, 100, 1),
                ('قهوة', 'مشروبات', 8, 20, 100, 1),
                ('بيبسي', 'مشروبات', 12, 18, 50, 0),
                ('ماء', 'مشروبات', 3, 7, 100, 0);
            `);
            console.log('تم إضافة منتجات افتراضية تلقائياً.');
        }

        console.log('تم الاتصال والتأكد من جداول PostgreSQL بنجاح.');
    } catch (err) {
        console.error('خطأ أثناء تجهيز قاعدة البيانات:', err);
    }
}

initDB();

// --- APIs ---

// 1. تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, pin } = req.body;
    try {
        const userRes = await pool.query(`SELECT * FROM users WHERE username = $1 AND pin = $2`, [username, pin]);
        if (userRes.rows.length === 0) return res.status(401).json({ message: 'بيانات غير صحيحة' });

        const user = userRes.rows[0];
        if (user.role === 'cashier') {
            const shiftRes = await pool.query(`SELECT * FROM shifts WHERE user_id = $1 AND status = 'open'`, [user.id]);
            res.json({ user, activeShift: shiftRes.rows[0] || null });
        } else {
            res.json({ user, activeShift: null });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. إدارة المستخدمين
app.get('/api/admin/users', async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, role FROM users ORDER BY id ASC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/users', async (req, res) => {
    const { id, username, pin, role } = req.body;
    try {
        if (id) {
            if (pin && pin.trim() !== '') {
                await pool.query(`UPDATE users SET username=$1, role=$2, pin=$3 WHERE id=$4`, [username, role, pin, id]);
            } else {
                await pool.query(`UPDATE users SET username=$1, role=$2 WHERE id=$3`, [username, role, id]);
            }
            res.json({ message: 'تم تحديث المستخدم' });
        } else {
            const newU = await pool.query(`INSERT INTO users (username, pin, role) VALUES ($1, $2, $3) RETURNING id`, [username, pin, role]);
            res.json({ id: newU.rows[0].id });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
        res.json({ message: 'تم حذف المستخدم' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. بدء شيفت جديد
app.post('/api/start-shift', async (req, res) => {
    const { user_id } = req.body;
    const shiftDate = new Date().toISOString().split('T')[0];
    try {
        const newShift = await pool.query(
            `INSERT INTO shifts (user_id, status, shift_date) VALUES ($1, 'open', $2) RETURNING id`,
            [user_id, shiftDate]
        );
        res.json({ shift_id: newShift.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. المنتجات (تحويل الأسعار إلى أرقام float)
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM products ORDER BY id ASC`);
        const formatted = result.rows.map(p => ({
            ...p,
            cost_price: parseFloat(p.cost_price || 0),
            selling_price: parseFloat(p.selling_price || 0)
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { id, name, category, cost_price, selling_price, stock_quantity, is_drink } = req.body;
    try {
        if (id) {
            await pool.query(
                `UPDATE products SET name=$1, category=$2, cost_price=$3, selling_price=$4, stock_quantity=$5, is_drink=$6 WHERE id=$7`,
                [name, category, cost_price, selling_price, stock_quantity, is_drink ? 1 : 0, id]
            );
            res.json({ message: 'تم التحديث' });
        } else {
            const newP = await pool.query(
                `INSERT INTO products (name, category, cost_price, selling_price, stock_quantity, is_drink) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [name, category, cost_price, selling_price, stock_quantity, is_drink ? 1 : 0]
            );
            res.json({ id: newP.rows[0].id });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
        res.json({ message: 'تم حذف المنتج' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. المصروفات
app.post('/api/expenses', async (req, res) => {
    const { shift_id, description, amount } = req.body;
    try {
        const exp = await pool.query(
            `INSERT INTO expenses (shift_id, description, amount) VALUES ($1, $2, $3) RETURNING id`,
            [shift_id, description || 'مصروف عام', amount]
        );
        res.json({ success: true, expense_id: exp.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/expenses/:shift_id', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM expenses WHERE shift_id = $1 ORDER BY created_at DESC`, [req.params.shift_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Checkout
app.post('/api/checkout', async (req, res) => {
    const { shift_id, cart, is_staff_order, paid_amount, discount_amount = 0 } = req.body;
    if (!cart || cart.length === 0) return res.status(400).json({ error: 'السلة فارغة' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const productIds = cart.map(item => item.id);
        const dbProdRes = await client.query(`SELECT * FROM products WHERE id = ANY($1::int[])`, [productIds]);
        const dbProductMap = new Map(dbProdRes.rows.map(p => [p.id, p]));

        for (const item of cart) {
            const dbProd = dbProductMap.get(item.id);
            if (!dbProd) throw new Error('المنتج غير موجود');
            if (dbProd.is_drink === 0 && dbProd.stock_quantity < item.qty) {
                throw new Error(`المخزون غير كافي للمنتج: ${dbProd.name}`);
            }
        }

        let realTotal = 0;
        cart.forEach(item => {
            const dbProd = dbProductMap.get(item.id);
            const unitPrice = is_staff_order ? parseFloat(dbProd.cost_price) : parseFloat(dbProd.selling_price);
            realTotal += unitPrice * item.qty;
        });

        realTotal = Math.max(0, realTotal - discount_amount);
        let calculatedTip = (paid_amount > realTotal && realTotal > 0) ? (paid_amount - realTotal) : 0;

        for (let index = 0; index < cart.length; index++) {
            const item = cart[index];
            const dbProd = dbProductMap.get(item.id);
            const finalUnitPrice = is_staff_order ? dbProd.cost_price : dbProd.selling_price;
            const tipForThisItem = (index === 0) ? calculatedTip : 0;

            await client.query(
                `INSERT INTO sales (shift_id, product_id, quantity, unit_price, unit_cost, discount_amount, is_staff_order, tip_amount) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [shift_id, item.id, item.qty, finalUnitPrice, dbProd.cost_price, discount_amount, is_staff_order ? 1 : 0, tipForThisItem]
            );

            if (dbProd.is_drink === 0) {
                await client.query(
                    `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
                    [item.qty, item.id]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, tip: calculatedTip });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 7. ملخص الشيفت
app.get('/api/shift-summary/:shift_id', async (req, res) => {
    try {
        const shiftId = req.params.shift_id;
        const salesRes = await pool.query(`
            SELECT 
                COALESCE(SUM(quantity * unit_price - discount_amount), 0) as total_sales,
                COALESCE(SUM(quantity * (unit_price - unit_cost) - discount_amount), 0) as total_profit,
                COALESCE(SUM(tip_amount), 0) as total_tips
            FROM sales WHERE shift_id = $1 AND is_refunded = 0
        `, [shiftId]);

        const expRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE shift_id = $1`, [shiftId]);

        const sales = parseFloat(salesRes.rows[0].total_sales);
        const tips = parseFloat(salesRes.rows[0].total_tips);
        const expenses = parseFloat(expRes.rows[0].total_expenses);

        res.json({
            total_sales: sales,
            total_profit: parseFloat(salesRes.rows[0].total_profit),
            total_tips: tips,
            total_expenses: expenses,
            expected_cash: (sales + tips) - expenses
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. إغلاق الشيفت
app.post('/api/end-shift', async (req, res) => {
    const { shift_id, actual_cash, notes } = req.body;
    try {
        const salesRes = await pool.query(`
            SELECT COALESCE(SUM(quantity * unit_price - discount_amount + tip_amount), 0) as total_cash_in 
            FROM sales WHERE shift_id = $1 AND is_refunded = 0
        `, [shift_id]);

        const expRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE shift_id = $1`, [shift_id]);

        const expectedCash = parseFloat(salesRes.rows[0].total_cash_in) - parseFloat(expRes.rows[0].total_expenses);
        const diff = (actual_cash || 0) - expectedCash;

        await pool.query(
            `UPDATE shifts SET end_time = CURRENT_TIMESTAMP, status = 'closed', expected_cash = $1, actual_cash = $2, cash_difference = $3, notes = $4 WHERE id = $5`,
            [expectedCash, actual_cash || 0, diff, notes, shift_id]
        );

        res.json({ message: 'تم إغلاق الشيفت بنجاح', expectedCash, actualCash: actual_cash, difference: diff });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. لوحة الأدمن
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const shiftsRes = await pool.query(`
            SELECT 
                s.id, s.start_time, s.end_time, s.status, s.shift_date, s.expected_cash, s.actual_cash, s.cash_difference, s.notes, u.username,
                COALESCE(SUM(sa.quantity * sa.unit_price - sa.discount_amount), 0) as total_sales,
                COALESCE(SUM(sa.quantity * (sa.unit_price - sa.unit_cost) - sa.discount_amount), 0) as total_profit,
                COALESCE(SUM(sa.tip_amount), 0) as total_tips
            FROM shifts s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN sales sa ON s.id = sa.shift_id AND sa.is_refunded = 0
            GROUP BY s.id, u.username ORDER BY s.id DESC
        `);

        const stockCol = await pool.query(`SELECT COALESCE(SUM(quantity * unit_cost), 0) as collected_stock_cost FROM sales WHERE is_refunded = 0`);
        const stockRem = await pool.query(`SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as remaining_stock_cost FROM products WHERE is_drink = 0`);
        const prodRes = await pool.query(`SELECT * FROM products ORDER BY id ASC`);

        res.json({
            shifts: shiftsRes.rows,
            stats: {
                collected_stock_cost: parseFloat(stockCol.rows[0].collected_stock_cost),
                remaining_stock_cost: parseFloat(stockRem.rows[0].remaining_stock_cost)
            },
            products: prodRes.rows.map(p => ({
                ...p,
                cost_price: parseFloat(p.cost_price || 0),
                selling_price: parseFloat(p.selling_price || 0)
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 شغال بنجاح على البورت ${PORT} باستخدام PostgreSQL`));
