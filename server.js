require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

app.use(cors());
app.use(bodyParser.json());

// 数据库初始化
const db = new sqlite3.Database('./openmonkey.db', (err) => {
    if (err) console.error('❌ 数据库连接失败', err);
    else {
        console.log('✅ 数据库连接成功');
        initDatabase();
    }
});

function initDatabase() {
    const fs = require('fs');
    const sql = fs.readFileSync('./database.sql', 'utf8');
    db.exec(sql, (err) => {
        if (err) console.error('❌ 初始化表失败', err);
        else {
            console.log('✅ 数据表已准备');
            createDefaultAdmin();
        }
    });
}

async function createDefaultAdmin() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    db.run(
        `INSERT OR IGNORE INTO users (username, password, role, credits) VALUES (?, ?, ?, ?)`,
        ['admin', hashedPassword, 'admin', 9999]
    );
}

// 登录接口
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: '用户名或密码错误' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: '用户名或密码错误' });
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            success: true,
            token,
            user: { username: user.username, role: user.role, credits: user.credits }
        });
    });
});

// 健康检查
app.get('/api/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 后端运行在 http://0.0.0.0:${PORT}`);
});