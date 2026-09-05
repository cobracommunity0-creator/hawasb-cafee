const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const dbPath = './cafe.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('خطأ في الاتصال بقاعدة البيانات:', err);
    else console.log('تم الاتصال بقاعدة البيانات بنجاح.');
});

// دالة أخذ نسخة احتياطية
function backupDatabase() {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `cafe_backup_${timestamp}.db`);

    fs.copyFile(dbPath, backupPath, (err) => {
        if (!err) {
            console.log(`[Backup] تم إنشاء نسخة احتياطية: ${backupPath}`);
            fs.readdir(backupDir, (err, files) => {
                if (!err) {
                    const backupFiles = files.filter(f => f.startsWith('cafe_backup_')).sort();
                    if (backupFiles.length > 7) {
                        const filesToDelete = backupFiles.slice(0, backupFiles.length - 7);
                        filesToDelete.forEach(file => {
                            fs.unlink(path.join(backupDir, file), () => {});
                        });
                    }
                }
            });
        }
    });
}

setInterval(backupDatabase, 4 * 60 * 60 * 1000);

// إنشاء الجداول وتغذية البيانات الافتراضية
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        pin TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        category TEXT,
        cost_price REAL,
        selling_price REAL,
        stock_quantity INTEGER DEFAULT 0,
        is_drink INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS product_ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_product_id INTEGER,
        ingredient_id INTEGER,
        quantity_required REAL,
        FOREIGN KEY(parent_product_id) REFERENCES products(id),
        FOREIGN KEY(ingredient_id) REFERENCES products(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS product_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        variant_name TEXT,
        price_modifier REAL DEFAULT 0,
        cost_modifier REAL DEFAULT 0,
        FOREIGN KEY(product_id) REFERENCES products(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        start_time DATETIME,
        end_time DATETIME,
        status TEXT,
        shift_date TEXT,
        expected_cash REAL DEFAULT 0,
        actual_cash REAL DEFAULT 0,
        cash_difference REAL DEFAULT 0,
        notes TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER,
        product_id INTEGER,
        quantity INTEGER,
        unit_price REAL,
        unit_cost REAL,
        discount_amount REAL DEFAULT 0,
        is_staff_order INTEGER DEFAULT 0,
        tip_amount REAL DEFAULT 0,
        is_refunded INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER,
        description TEXT,
        amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`INSERT OR IGNORE INTO users (id, username, pin, role) VALUES 
        (1, 'admin', '1234', 'admin'),
        (2, 'cashier', '1111', 'cashier')`);

    // التأكد من وجود منتجات افتراضية في حالة كانت الداتابيز جديدة تماماً
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare(`INSERT INTO products (name, category, cost_price, selling_price, stock_quantity, is_drink) VALUES (?, ?, ?, ?, ?, ?)`);
            stmt.run('شاي', 'مشروبات', 5, 15, 100, 1);
            stmt.run('قهوة', 'مشروبات', 8, 20, 100, 1);
            stmt.run('بيبسي', 'مشروبات', 12, 18, 50, 0);
            stmt.run('ماء', 'مشروبات', 3, 7, 100, 0);
            stmt.finalize();
            console.log('تم إضافة أصناف افتراضية للجدول.');
        }
    });
});

// --- API Endpoints ---

// 1. تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, pin } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND pin = ?`, [username, pin], (err, user) => {
        if (err || !user) return res.status(401).json({ message: 'بيانات غير صحيحة' });

        if (user.role === 'cashier') {
            db.get(`SELECT * FROM shifts WHERE user_id = ? AND status = 'open'`, [user.id], (err, activeShift) => {
                res.json({ user, activeShift: activeShift || null });
            });
        } else {
            res.json({ user, activeShift: null });
        }
    });
});

// 2. إدارة المستخدمين
app.get('/api/admin/users', (req, res) => {
    db.all(`SELECT id, username, role FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/users', (req, res) => {
    const { id, username, pin, role } = req.body;
    if (id) {
        let query = `UPDATE users SET username=?, role=?`;
        let params = [username, role];
        if (pin && pin.trim() !== '') {
            query += `, pin=?`;
            params.push(pin);
        }
        query += ` WHERE id=?`;
        params.push(id);

        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تم تحديث المستخدم بنجاح' });
        });
    } else {
        db.run(`INSERT INTO users (username, pin, role) VALUES (?, ?, ?)`, [username, pin, role], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
    }
});

app.delete('/api/admin/users/:id', (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'تم حذف المستخدم بنجاح' });
    });
});

// 3. بدء شيفت جديد
app.post('/api/start-shift', (req, res) => {
    const { user_id } = req.body;
    const now = new Date();
    const shiftDate = now.toISOString().split('T')[0];

    db.run(`INSERT INTO shifts (user_id, start_time, status, shift_date) VALUES (?, datetime('now', 'localtime'), 'open', ?)`,
        [user_id, shiftDate], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ shift_id: this.lastID });
        });
});

// 4. الأصناف والمنتجات
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/products', (req, res) => {
    const { id, name, category, cost_price, selling_price, stock_quantity, is_drink } = req.body;

    if (id) {
        db.run(`UPDATE products SET name=?, category=?, cost_price=?, selling_price=?, stock_quantity=?, is_drink=? WHERE id=?`,
            [name, category, cost_price, selling_price, stock_quantity, is_drink ? 1 : 0, id], err => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'تم التحديث' });
            });
    } else {
        db.run(`INSERT INTO products (name, category, cost_price, selling_price, stock_quantity, is_drink) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, category, cost_price, selling_price, stock_quantity, is_drink ? 1 : 0], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
    }
});

app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    db.run(`DELETE FROM product_ingredients WHERE parent_product_id = ? OR ingredient_id = ?`, [productId, productId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`DELETE FROM product_variants WHERE product_id = ?`, [productId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`DELETE FROM products WHERE id = ?`, [productId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'تم حذف المنتج بنجاح' });
            });
        });
    });
});

// 5. المصروفات
app.post('/api/expenses', (req, res) => {
    const { shift_id, description, amount } = req.body;
    if (!shift_id || !amount) return res.status(400).json({ error: 'بيانات المصروف غير مكتملة' });

    db.run(`INSERT INTO expenses (shift_id, description, amount) VALUES (?, ?, ?)`,
        [shift_id, description || 'مصروف عام', amount], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, expense_id: this.lastID });
        });
});

app.get('/api/expenses/:shift_id', (req, res) => {
    db.all(`SELECT * FROM expenses WHERE shift_id = ? ORDER BY created_at DESC`, [req.params.shift_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 6. إتمام البيع آمن ومصلح (Secure Checkout)
app.post('/api/checkout', (req, res) => {
    const { shift_id, cart, is_staff_order, paid_amount, discount_amount = 0 } = req.body;

    if (!cart || cart.length === 0) return res.status(400).json({ error: 'السلة فارغة' });

    const productIds = cart.map(item => item.id);
    const placeholders = productIds.map(() => '?').join(',');

    db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds, (err, dbProducts) => {
        if (err || !dbProducts) return res.status(500).json({ error: 'خطأ في التحقق من المنتجات' });

        const dbProductMap = new Map(dbProducts.map(p => [p.id, p]));

        // التحقق من توافر الكمية للمنتجات غير المشروبات
        for (const item of cart) {
            const dbProd = dbProductMap.get(item.id);
            if (!dbProd) return res.status(400).json({ error: `المنتج غير موجود` });

            if (dbProd.is_drink === 0 && dbProd.stock_quantity < item.qty) {
                return res.status(400).json({ error: `المخزون غير كافي للمنتج: ${dbProd.name}` });
            }
        }

        let realTotal = 0;
        cart.forEach(item => {
            const dbProd = dbProductMap.get(item.id);
            const unitPrice = is_staff_order ? dbProd.cost_price : dbProd.selling_price;
            realTotal += unitPrice * item.qty;
        });

        realTotal = Math.max(0, realTotal - discount_amount);
        let calculatedTip = (paid_amount > realTotal && realTotal > 0) ? (paid_amount - realTotal) : 0;

        db.serialize(() => {
            const saleStmt = db.prepare(`INSERT INTO sales (shift_id, product_id, quantity, unit_price, unit_cost, discount_amount, is_staff_order, tip_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            const updateStockStmt = db.prepare(`UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND is_drink = 0`);

            cart.forEach((item, index) => {
                const dbProd = dbProductMap.get(item.id);
                const finalUnitPrice = is_staff_order ? dbProd.cost_price : dbProd.selling_price;
                const tipForThisItem = (index === 0) ? calculatedTip : 0;

                saleStmt.run(shift_id, item.id, item.qty, finalUnitPrice, dbProd.cost_price, discount_amount, is_staff_order ? 1 : 0, tipForThisItem);
                updateStockStmt.run(item.qty, item.id);
            });

            saleStmt.finalize();
            updateStockStmt.finalize((err) => {
                if (err) return res.status(500).json({ error: 'حدث خطأ أثناء خصم المخزون' });
                res.json({ success: true, tip: calculatedTip });
            });
        });
    });
});

// 7. إلغاء أوردر / مرجع
app.post('/api/sales/refund', (req, res) => {
    const { sale_id } = req.body;

    db.get(`SELECT * FROM sales WHERE id = ? AND is_refunded = 0`, [sale_id], (err, sale) => {
        if (err || !sale) return res.status(404).json({ error: 'العملية غير موجودة أو تم إلغاؤها سابقاً' });

        db.serialize(() => {
            db.run(`UPDATE sales SET is_refunded = 1 WHERE id = ?`, [sale_id]);
            db.run(`UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND is_drink = 0`, [sale.quantity, sale.product_id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'تم إرجاع العملية وإعادة الكميات للمخزون بنجاح' });
            });
        });
    });
});

// 8. ملخص الشيفت المباشر
app.get('/api/shift-summary/:shift_id', (req, res) => {
    const shiftId = req.params.shift_id;
    db.get(`
        SELECT 
            COALESCE(SUM(quantity * unit_price - discount_amount), 0) as total_sales,
            COALESCE(SUM(quantity * (unit_price - unit_cost) - discount_amount), 0) as total_profit,
            COALESCE(SUM(tip_amount), 0) as total_tips
        FROM sales WHERE shift_id = ? AND is_refunded = 0
    `, [shiftId], (err, salesRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.get(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE shift_id = ?`, [shiftId], (err, expRow) => {
            const expenses = expRow ? expRow.total_expenses : 0;
            const sales = salesRow ? salesRow.total_sales : 0;
            const tips = salesRow ? salesRow.total_tips : 0;
            const expectedCash = (sales + tips) - expenses;

            res.json({
                total_sales: sales,
                total_profit: salesRow ? salesRow.total_profit : 0,
                total_tips: tips,
                total_expenses: expenses,
                expected_cash: expectedCash
            });
        });
    });
});

// 9. إغلاق الشيفت وترحيل النقدية
app.post('/api/end-shift', (req, res) => {
    const { shift_id, actual_cash, notes } = req.body;

    db.get(`
        SELECT COALESCE(SUM(quantity * unit_price - discount_amount + tip_amount), 0) as total_cash_in 
        FROM sales WHERE shift_id = ? AND is_refunded = 0
    `, [shift_id], (err, salesRow) => {
        db.get(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE shift_id = ?`, [shift_id], (err, expRow) => {
            const expectedCash = (salesRow ? salesRow.total_cash_in : 0) - (expRow ? expRow.total_expenses : 0);
            const diff = (actual_cash || 0) - expectedCash;

            db.run(`UPDATE shifts SET end_time = datetime('now', 'localtime'), status = 'closed', expected_cash = ?, actual_cash = ?, cash_difference = ?, notes = ? WHERE id = ?`,
                [expectedCash, actual_cash || 0, diff, notes, shift_id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    backupDatabase();
                    res.json({ 
                        message: 'تم إغلاق الشيفت بنجاح', 
                        expectedCash, 
                        actualCash: actual_cash, 
                        difference: diff 
                    });
                });
        });
    });
});

// 10. لوحة الأدمن
app.get('/api/admin/dashboard', (req, res) => {
    db.all(`
        SELECT 
            s.id, s.start_time, s.end_time, s.status, s.shift_date, s.expected_cash, s.actual_cash, s.cash_difference, s.notes, u.username,
            COALESCE(SUM(sa.quantity * sa.unit_price - sa.discount_amount), 0) as total_sales,
            COALESCE(SUM(sa.quantity * (sa.unit_price - sa.unit_cost) - sa.discount_amount), 0) as total_profit,
            COALESCE(SUM(sa.tip_amount), 0) as total_tips
        FROM shifts s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN sales sa ON s.id = sa.shift_id AND sa.is_refunded = 0
        GROUP BY s.id ORDER BY s.id DESC
    `, [], (err, shifts) => {
        db.get(`SELECT COALESCE(SUM(quantity * unit_cost), 0) as collected_stock_cost FROM sales WHERE is_refunded = 0`, [], (err, stockCollected) => {
            db.get(`SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as remaining_stock_cost FROM products WHERE is_drink = 0`, [], (err, stockRemaining) => {
                db.all(`SELECT * FROM products`, [], (err, products) => {
                    res.json({
                        shifts: shifts || [],
                        stats: {
                            collected_stock_cost: stockCollected ? stockCollected.collected_stock_cost : 0,
                            remaining_stock_cost: stockRemaining ? stockRemaining.remaining_stock_cost : 0
                        },
                        products: products || []
                    });
                });
            });
        });
    });
});

app.post('/api/admin/force-close-shift', (req, res) => {
    db.run(`UPDATE shifts SET end_time = datetime('now', 'localtime'), status = 'closed', notes = 'إغلاق إجباري بواسطة المسؤول' WHERE id = ?`,
        [req.body.shift_id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            backupDatabase();
            res.json({ message: 'تم الإغلاق الإجباري بنجاح' });
        });
});

app.listen(PORT, () => console.log(`🚀 شغال بنجاح على البورت ${PORT} - حواسب كافيه ❤️`));
