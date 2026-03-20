# OPENMONKEY AI 后端

## 快速开始

1. 克隆仓库或下载所有文件到本地。
2. 在项目根目录创建 `.env` 文件（可复制 `.env.example`），并填入 `DEEPSEEK_API_KEY` 和 `JWT_SECRET`。
3. 安装依赖：`npm install`
4. 启动服务：`npm start`
5. 后端将运行在 `http://localhost:3000`

## API 接口

- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `GET /api/healthz` - 健康检查
- `GET /api/sales-data` - 获取店铺数据（需认证）
- `POST /api/sales-data` - 保存店铺数据（需认证）
- `GET /api/ad-groups` - 获取广告组（需认证）
- `POST /api/ad-groups` - 保存广告组（需认证）
- `POST /api/deepseek` - DeepSeek 智能诊断（需认证，消耗次数）
- `POST /api/admin/add-credits` - 管理员充值（需管理员权限）

## 部署到 Replit

1. 将此仓库导入 Replit（从 GitHub 导入）。
2. 在 Shell 中运行 `npm install`。
3. 创建 `.env` 文件（使用左侧 Secrets 或直接创建文件）。
4. 点击 Run 启动。
5. 获取公网地址（Webview 窗口中的 URL）。