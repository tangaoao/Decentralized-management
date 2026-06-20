/**
 * 用户管理路由：财政端可管理用户，所有角色可获取银行列表
 * 仅信息中心部门的管理员可操作用户管理功能
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, requireInfoCenter } = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { listUsers, listUsersByRole, createUser, updateUser, resetPassword, deleteUser, findUserById, dbRun } = require('../db');

// 所有接口均需认证
router.use(authMiddleware);

/** GET /api/users/banks — 获取银行用户列表（单位端下拉选项用） */
router.get('/banks', (req, res) => {
  const banks = listUsersByRole('BANK');
  res.json({ data: banks.map(b => ({ username: b.username, bank_name: b.bank_name })) });
});

/** GET /api/users — 获取所有用户列表（仅信息中心） */
router.get('/', roleCheck('FINANCE'), requireInfoCenter, (req, res) => {
  const users = listUsers();
  res.json({ data: users });
});

/** POST /api/users — 新增用户（仅信息中心） */
router.post('/', roleCheck('FINANCE'), requireInfoCenter, async (req, res) => {
  try {
    const { username, password, role, display_name, unit_name, bank_name, department_id } = req.body;

    // 校验
    if (!username || !password || !role || !display_name) {
      return res.status(400).json({ error: '用户名、密码、角色和显示名称为必填项' });
    }
    if (!['UNIT', 'BANK', 'FINANCE'].includes(role)) {
      return res.status(400).json({ error: '角色必须是 UNIT、BANK 或 FINANCE' });
    }
    if (username.length < 2 || username.length > 50) {
      return res.status(400).json({ error: '用户名长度应在2-50个字符之间' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '密码长度至少4个字符' });
    }

    const user = await createUser({
      username: username.trim(),
      password,
      role,
      display_name: display_name.trim(),
      unit_name: unit_name || null,
      bank_name: bank_name || null,
      department_id: department_id || null,
    });
    const { password_hash: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    console.error('创建用户错误:', err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

/** PUT /api/users/:id/reset-password — 重置密码为随机密码（仅信息中心） */
// 注意：此路由必须在 PUT /:id 之前，否则 :id 会匹配 "reset-password"
router.put('/:id/reset-password', roleCheck('FINANCE'), requireInfoCenter, async (req, res) => {
  try {
    const { id } = req.params;

    const { changes, tempPassword } = await resetPassword(id);
    if (changes === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ message: `密码已重置`, tempPassword });
  } catch (err) {
    console.error('重置密码错误:', err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

/** PUT /api/users/:id — 修改用户信息（仅信息中心） */
router.put('/:id', roleCheck('FINANCE'), requireInfoCenter, (req, res) => {
  const { id } = req.params;
  const { display_name, unit_name, bank_name, department_id } = req.body;

  // 至少需要一个字段
  if (!display_name && !unit_name && !bank_name && department_id === undefined) {
    return res.status(400).json({ error: '至少需要提供显示名称、单位名称、银行名称或部门ID之一' });
  }

  const fields = {};
  if (display_name !== undefined) fields.display_name = display_name.trim();
  if (unit_name !== undefined) fields.unit_name = unit_name ? unit_name.trim() : null;
  if (bank_name !== undefined) fields.bank_name = bank_name ? bank_name.trim() : null;
  if (department_id !== undefined) fields.department_id = department_id;

  const { changes } = updateUser(id, fields);
  if (changes === 0) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ message: '用户信息已更新' });
});

/** PUT /api/users/:id/toggle-active — 启用/禁用用户（仅信息中心） */
router.put('/:id/toggle-active', roleCheck('FINANCE'), requireInfoCenter, (req, res) => {
  const { id } = req.params;

  const user = findUserById(id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 不能禁用自己
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: '不能禁用自己' });
  }

  const newActive = user.is_active ? 0 : 1;
  dbRun('UPDATE users SET is_active = ? WHERE id = ?', [newActive, id]);
  res.json({ message: newActive ? '账号已启用' : '账号已禁用', is_active: !!newActive });
});

/** DELETE /api/users/:id — 删除用户（仅信息中心） */
router.delete('/:id', roleCheck('FINANCE'), requireInfoCenter, (req, res) => {
  const { id } = req.params;

  // 不能删除自己
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: '不能删除自己' });
  }

  const { changes } = deleteUser(id);
  if (changes === 0) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ message: '用户已删除' });
});

module.exports = router;
