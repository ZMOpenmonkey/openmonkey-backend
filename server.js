require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 请求日志
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// ---------- 数据库初始化 ----------
const db = new sqlite3.Database('./openmonkey.db', (err) => {
    if (err) {
        console.error('❌ 数据库连接失败', err);
    } else {
        console.log('✅ 数据库连接成功');
        initDatabase();
    }
});

function initDatabase() {
    const fs = require('fs');
    const sql = fs.readFileSync('./database.sql', 'utf8');
    db.exec(sql, (err) => {
        if (err) {
            console.error('❌ 初始化表失败', err);
        } else {
            console.log('✅ 数据表已准备');
            // 确保 users 表有 credits 字段（兼容性）
            db.all(`PRAGMA table_info(users)`, (err, rows) => {
                if (err) console.error('❌ 检查表结构失败', err);
                else {
                    const hasCredits = rows.some(col => col.name === 'credits');
                    if (!hasCredits) {
                        db.run(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 5`, (err) => {
                            if (err) console.error('❌ 添加 credits 字段失败', err);
                            else console.log('✅ 已添加 credits 字段');
                        });
                    }
                }
                createDefaultAdmin();
            });
        }
    });
}

async function createDefaultAdmin() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    db.run(
        `INSERT OR IGNORE INTO users (username, password, role, credits) VALUES (?, ?, ?, ?)`,
        ['admin', hashedPassword, 'admin', 9999],
        function(err) {
            if (err) console.error('❌ 创建默认管理员失败', err);
            else console.log('✅ 默认管理员已创建 (admin/admin123)');
        }
    );
}

// ---------- 认证中间件 ----------
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: '未提供令牌' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: '令牌无效' });
        req.user = user;
        next();
    });
}

// ---------- API 路由 ----------
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: '用户名和密码必填' });
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
        `INSERT INTO users (username, password, credits) VALUES (?, ?, 5)`,
        [username, hashedPassword],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.json({ success: false, message: '用户名已存在' });
                return res.status(500).json({ success: false, message: '注册失败' });
            }
            res.json({ success: true, message: '注册成功，已赠送 5 次诊断次数' });
        }
    );
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: '用户名或密码错误' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: '用户名或密码错误' });
        db.get(`SELECT username, role, credits FROM users WHERE id = ?`, [user.id], (err, userInfo) => {
            if (err) return res.status(500).json({ success: false, message: '登录失败' });
            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            res.json({
                success: true,
                token,
                user: { username: user.username, role: user.role, credits: userInfo.credits }
            });
        });
    });
});

app.post('/api/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: '用户不存在' });
        const valid = await bcrypt.compare(oldPassword, user.password);
        if (!valid) return res.status(401).json({ success: false, message: '旧密码错误' });
        const hashedNew = await bcrypt.hash(newPassword, 10);
        db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashedNew, userId], function(err) {
            if (err) return res.status(500).json({ success: false, message: '密码修改失败' });
            res.json({ success: true, message: '密码已修改' });
        });
    });
});

// 店铺数据
app.get('/api/sales-data', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.all(`SELECT * FROM sales_data WHERE user_id = ? ORDER BY date`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: '查询失败' });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/sales-data', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const salesData = req.body.data;
    if (!Array.isArray(salesData)) return res.status(400).json({ success: false, message: '数据格式错误' });
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`DELETE FROM sales_data WHERE user_id = ?`, [userId]);
        const stmt = db.prepare(`INSERT INTO sales_data (user_id, date, visitors, bounce, cart, paying, revenue, adSpend, adRevenue, search) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const d of salesData) {
            stmt.run(
                userId,
                d.date,
                d.visitors || 0,
                d.bounce || 0,
                d.cart || 0,
                d.paying || 0,
                d.revenue || 0,
                d.adSpend || 0,
                d.adRevenue || 0,
                d.search || 0
            );
        }
        stmt.finalize();
        db.run('COMMIT', (err) => {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ success: false, message: '保存失败' }); }
            res.json({ success: true, message: '保存成功' });
        });
    });
});

// 广告组
app.get('/api/ad-groups', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.all(`SELECT * FROM ad_groups WHERE user_id = ?`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: '查询失败' });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/ad-groups', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const adGroups = req.body.data;
    if (!Array.isArray(adGroups)) return res.status(400).json({ success: false, message: '数据格式错误' });
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`DELETE FROM ad_groups WHERE user_id = ?`, [userId]);
        const stmt = db.prepare(`INSERT INTO ad_groups (user_id, name, spend, revenue, clicks, impressions) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const g of adGroups) {
            stmt.run(
                userId,
                g.name || '',
                g.spend || 0,
                g.revenue || 0,
                g.clicks || 0,
                g.impressions || 0
            );
        }
        stmt.finalize();
        db.run('COMMIT', (err) => {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ success: false, message: '保存失败' }); }
            res.json({ success: true, message: '保存成功' });
        });
    });
});

// 管理员
app.get('/api/admin/users-summary', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: '需要管理员权限' });
    db.all(`
        SELECT 
            u.username, u.role, u.created_at, u.credits,
            (SELECT COUNT(*) FROM sales_data WHERE user_id = u.id) as sales_count,
            (SELECT MAX(date) FROM sales_data WHERE user_id = u.id) as last_date,
            (SELECT SUM(revenue) FROM sales_data WHERE user_id = u.id) as total_revenue,
            (SELECT SUM(adSpend) FROM sales_data WHERE user_id = u.id) as total_adSpend,
            (SELECT COUNT(*) FROM ad_groups WHERE user_id = u.id) as ad_group_count
        FROM users u
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: '查询失败' });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/admin/add-credits', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: '需要管理员权限' });
    const { username, creditsToAdd } = req.body;
    if (!username || !creditsToAdd || creditsToAdd <= 0) return res.status(400).json({ success: false, message: '无效输入' });
    db.run(`UPDATE users SET credits = credits + ? WHERE username = ?`, [creditsToAdd, username], function(err) {
        if (err) return res.status(500).json({ success: false, message: '数据库错误' });
        if (this.changes === 0) return res.status(404).json({ success: false, message: '用户不存在' });
        db.get(`SELECT credits FROM users WHERE username = ?`, [username], (err, row) => {
            if (err) return res.json({ success: true, message: '充值成功，但无法获取最新余额' });
            res.json({ success: true, message: '充值成功', newCredits: row.credits });
        });
    });
});

// 健康检查
app.get('/api/healthz', (req, res) => res.json({ status: 'ok' }));

// ---------- DeepSeek 诊断 ----------
async function callDeepSeek(prompt) {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: false
    }, {
        timeout: 30000,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        }
    });
    return response.data;
}

app.post('/api/deepseek', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '缺少prompt' });

    db.get(`SELECT credits FROM users WHERE id = ?`, [userId], async (err, user) => {
        if (err || !user) return res.status(500).json({ success: false, message: '用户数据错误' });
        if (user.credits <= 0) return res.status(403).json({ success: false, message: '余额不足，请充值' });

        db.run(`UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0`, [userId], async function(err) {
            if (err || this.changes === 0) return res.status(500).json({ success: false, message: '扣费失败' });

            try {
                const data = await callDeepSeek(prompt);
                if (data.choices && data.choices[0]?.message?.content) {
                    db.get(`SELECT credits FROM users WHERE id = ?`, [userId], (err, row) => {
                        res.json({
                            success: true,
                            text: data.choices[0].message.content,
                            creditsRemaining: row ? row.credits : user.credits - 1
                        });
                    });
                } else {
                    db.run(`UPDATE users SET credits = credits + 1 WHERE id = ?`, [userId]);
                    res.json({ success: false, message: 'DeepSeek返回空' });
                }
            } catch (error) {
                db.run(`UPDATE users SET credits = credits + 1 WHERE id = ?`, [userId]);
                console.error('DeepSeek 错误:', error.response?.data || error.message);
                res.status(500).json({ success: false, message: 'DeepSeek 服务异常' });
            }
        });
    });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 后端服务运行在 http://0.0.0.0:${PORT}`);
});