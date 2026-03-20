-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    credits INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 店铺数据表
CREATE TABLE IF NOT EXISTS sales_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    visitors INTEGER DEFAULT 0,
    bounce INTEGER DEFAULT 0,
    cart INTEGER DEFAULT 0,
    paying INTEGER DEFAULT 0,
    revenue REAL DEFAULT 0,
    adSpend REAL DEFAULT 0,
    adRevenue REAL DEFAULT 0,
    search INTEGER DEFAULT 0,
    UNIQUE(user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- 广告组表
CREATE TABLE IF NOT EXISTS ad_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    spend REAL DEFAULT 0,
    revenue REAL DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
);