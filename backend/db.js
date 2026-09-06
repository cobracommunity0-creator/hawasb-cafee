import pg from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

export const initDB = async () => {
  try {
    const schemaPath = path.join(process.cwd(), 'schema.sql');
    const seedPath = path.join(process.cwd(), 'seed.sql');
    
    const sqlSchema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sqlSchema);

    // إضافة البيانات التجريبية
    if (fs.existsSync(seedPath)) {
      const sqlSeed = fs.readFileSync(seedPath, 'utf8');
      await pool.query(sqlSeed);
    }
    
    console.log('تم إنشاء الجداول وإدراج البيانات التجريبية بنجاح!');
  } catch (err) {
    console.error('خطأ أثناء إعداد قاعدة البيانات:', err.message);
  }
};

export default pool;