/**
 * Express 应用入口
 * 挂载中间件、路由，启动服务器
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const userRoutes = require('./routes/users');
const departmentRoutes = require('./routes/departments');

const PORT = process.env.PORT || 5000;

async function main() {
  // 初始化数据库
  await initDb();

  const app = express();

  // 中间件
  app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
  }));
  app.use(express.json());

  // 路由
  app.use('/api/auth', authRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/departments', departmentRoutes);

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  // 全局错误处理
  app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  });

  app.listen(PORT, () => {
    console.log(`后端服务已启动: http://localhost:${PORT}`);
    console.log(`健康检查: http://localhost:${PORT}/api/health`);
  });
}

main().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
