CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    pin VARCHAR(10) UNIQUE NOT NULL,
    role VARCHAR(20) CHECK (role IN ('admin', 'cashier')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    stock_quantity NUMERIC(10, 3) NOT NULL DEFAULT 0,
    base_unit VARCHAR(20) NOT NULL,
    cost_per_base_unit NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    is_drink BOOLEAN DEFAULT TRUE,
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(50) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    cost NUMERIC(10, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_recipes (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    variant_id INT REFERENCES product_variants(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES raw_ingredients(id) ON DELETE CASCADE,
    quantity NUMERIC(10, 3) NOT NULL,
    recipe_unit VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    starting_cash NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ending_cash NUMERIC(10, 2),
    total_sales NUMERIC(10, 2) DEFAULT 0,
    total_cogs NUMERIC(10, 2) DEFAULT 0,
    total_tips NUMERIC(10, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    shift_id INT REFERENCES shifts(id),
    user_id INT REFERENCES users(id),
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    order_type VARCHAR(20) CHECK (order_type IN ('standard', 'staff')) DEFAULT 'standard',
    total_amount NUMERIC(10, 2) NOT NULL,
    paid_amount NUMERIC(10, 2) NOT NULL,
    tip_amount NUMERIC(10, 2) DEFAULT 0,
    cogs_total NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    variant_id INT REFERENCES product_variants(id),
    quantity INT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    unit_cost NUMERIC(10, 2) NOT NULL
);