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

// الاتصال بقاعدة البيانات عبر البيئة أو التخزين المحلي للاختبار
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// إنشاء الجداول بصيغة PostgreSQL
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
                cost_price NUMERIC,
                selling_price NUMERIC,
                stock_quantity INT DEFAULT 0,
                is_drink INT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS product_ingredients (
                id SERIAL PRIMARY KEY,
                parent_product_id INT REFERENCES products(id) ON DELETE CASCADE,
                ingredient_id INT REFERENCES products(id) ON DELETE CASCADE,
                quantity_required NUMERIC
            );
            CREATE TABLE IF NOT EXISTS product_variants (
                id SERIAL PRIMARY KEY,
                product_id INT REFERENCES products(id) ON DELETE CASCADE,
                variant_name VARCHAR(255),
                price_modifier NUMERIC DEFAULT 0,
                cost_modifier NUMERIC DEFAULT 0
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
        console.log('تم إعداد جداول قاعدة البيانات بنجاح.');
    } catch (err) {
        console.error('خطأ أثناء تهيئة قاعدة البيانات:', err);
    }
}
initDB();

// مثال لتحديث مسار تسجيل الدخول بصياغة Postgres:
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

// باقي المسارات تتبع نفس أسلوب الاستعلام المباشر عبر pool.query ...

app.listen(PORT, () => console.log(`🚀 شغال على البورت ${PORT} - حواسب كافيه ❤️`));
