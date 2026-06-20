/**
 * JWT 认证中间件
 * 从 Authorization header 提取 Bearer token，验证后解析用户信息挂载到 req.user
 */
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('致命错误：环境变量 JWT_SECRET 未设置。服务器拒绝启动。');
  console.error('请设置环境变量：set JWT_SECRET=<您的随机密钥> 或在 .env 文件中配置');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

/** 信息中心部门名称常量 */
const INFO_CENTER_DEPT = '信息中心';

/** 签发 token，包含部门信息用于前端权限判断 */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      department_id: user.department_id || null,
      department_name: user.department_name || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Express 中间件：验证 JWT */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username, role, department_id, department_name, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
}

/** Express 中间件：要求用户属于信息中心部门（财政端管理员） */
function requireInfoCenter(req, res, next) {
  if (!req.user || req.user.department_name !== INFO_CENTER_DEPT) {
    return res.status(403).json({ error: '权限不足，仅信息中心可执行此操作' });
  }
  next();
}

module.exports = { authMiddleware, signToken, requireInfoCenter, INFO_CENTER_DEPT, JWT_SECRET };
