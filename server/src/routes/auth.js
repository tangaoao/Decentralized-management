/**
 * 认证路由：登录、获取当前用户信息
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { signToken, authMiddleware } = require('../middleware/auth');
const { findUser, findUserById, verifyPassword, hashPassword, changePassword, queryOne, dbRun } = require('../db');

// 登录接口限流：每个 IP 每 1 分钟最多 10 次尝试
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: '登录尝试过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// bcrypt 哈希以 $2b$ 或 $2a$ 开头，旧 SHA-256 是 64 位十六进制
function isBcryptHash(hash) {
  return hash && (hash.startsWith('$2b$') || hash.startsWith('$2a$'));
}

/** 辅助：根据 department_id 查询部门名称 */
function getDepartmentName(departmentId) {
  if (!departmentId) return null;
  const dept = queryOne('SELECT name FROM departments WHERE id = ?', [departmentId]);
  return dept ? dept.name : null;
}

/** 校验密码强度：长度 ≥ 8，大写/小写/数字/特殊字符至少 3 种 */
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return '密码长度至少为8位';
  }
  let types = 0;
  if (/[A-Z]/.test(password)) types++;
  if (/[a-z]/.test(password)) types++;
  if (/[0-9]/.test(password)) types++;
  if (/[^A-Za-z0-9]/.test(password)) types++;
  if (types < 3) {
    return '密码需包含大写字母、小写字母、数字、特殊字符中至少3种';
  }
  return null; // 通过
}

/** POST /api/auth/login — 用户登录 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const user = findUser(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 兼容旧 SHA-256 密码：先用 bcrypt 验证，失败则尝试旧格式并自动升级
    let valid = false;
    if (isBcryptHash(user.password_hash)) {
      valid = await verifyPassword(password, user.password_hash);
    } else {
      // 旧 SHA-256 格式 — 验证后自动升级为 bcrypt
      const crypto = require('crypto');
      const oldHash = crypto.createHash('sha256').update(password + 'secondary-approval-salt').digest('hex');
      if (oldHash === user.password_hash) {
        valid = true;
        // 自动升级为 bcrypt
        const newHash = await hashPassword(password);
        dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
        console.log(`已升级用户 ${user.username} 的密码哈希为 bcrypt`);
      }
    }

    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 检查账号是否被禁用
    if (user.is_active === 0) {
      return res.status(403).json({ error: '该账号已被禁用，请联系管理员' });
    }

    // 查询部门名称，附加到 user 对象
    const department_name = getDepartmentName(user.department_id);

    // 签发 JWT（只包含必要字段，不包含 password_hash）
    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
      department_id: user.department_id,
      department_name,
    });

    // 返回用户信息（不含密码哈希）
    const { password_hash: _, ...safeUser } = user;
    res.json({ token, user: { ...safeUser, department_name } });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

/** GET /api/auth/me — 获取当前登录用户信息 */
router.get('/me', authMiddleware, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const { password_hash: _, ...safeUser } = user;
  const department_name = getDepartmentName(user.department_id);
  res.json({ ...safeUser, department_name });
});

/** POST /api/auth/change-password — 强制修改密码（password_reset_required=1 时使用） */
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({ error: '请输入新密码和确认密码' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: '两次输入的密码不一致' });
    }

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      return res.status(400).json({ error: strengthError });
    }

    // 确认用户当前处于强制改密状态
    const user = findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!user.password_reset_required) {
      return res.status(400).json({ error: '当前无需修改密码' });
    }

    const newHash = await hashPassword(password);
    changePassword(user.id, newHash);

    // 签发新的 JWT（此时 flag 已清零）
    const updatedUser = findUserById(user.id);
    const department_name = getDepartmentName(updatedUser.department_id);
    const token = signToken({
      id: updatedUser.id,
      username: updatedUser.username,
      role: updatedUser.role,
      department_id: updatedUser.department_id,
      department_name,
    });

    const { password_hash: _, ...safeUser } = updatedUser;
    res.json({
      message: '密码修改成功',
      token,
      user: { ...safeUser, department_name },
    });
  } catch (err) {
    console.error('修改密码错误:', err);
    res.status(500).json({ error: '修改密码失败，请稍后重试' });
  }
});

module.exports = router;
