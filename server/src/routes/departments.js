/**
 * 部门管理路由：财政端可管理组织架构树
 * 支持三大分类（预算单位/财政系统/银行系统）的树状结构、拖拽排序、增删改
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, requireInfoCenter } = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const {
  buildDepartmentTree, getDepartmentById, createDepartment,
  updateDepartment, deleteDepartment, moveDepartment,
  reorderDepartments, listUsersByDepartment,
  getChildDepartments,
  getDescendantDepartmentIds,
  listUsersByDepartments,
} = require('../db');

// 所有接口均需认证 + 信息中心部门权限
router.use(authMiddleware);
router.use(requireInfoCenter);

/** GET /api/departments/tree — 获取完整部门树 */
router.get('/tree', (req, res) => {
  try {
    const tree = buildDepartmentTree();
    res.json({ data: tree });
  } catch (err) {
    res.status(500).json({ error: '获取部门树失败' });
  }
});

/** GET /api/departments/:id/users — 获取某部门下的用户列表（支持 ?recursive=true 递归查所有下级） */
router.get('/:id/users', (req, res) => {
  const { id } = req.params;
  const { recursive } = req.query;
  try {
    const dept = getDepartmentById(id);
    if (!dept) {
      return res.status(404).json({ error: '部门不存在' });
    }

    let users;
    if (recursive === 'true') {
      // 递归查询：自身 + 所有后代部门的用户
      const descendantIds = getDescendantDepartmentIds(id);
      const allIds = [parseInt(id), ...descendantIds];
      users = listUsersByDepartments(allIds);
    } else {
      users = listUsersByDepartment(id);
    }

    res.json({ data: users, department: dept, recursive: recursive === 'true' });
  } catch (err) {
    res.status(500).json({ error: '获取部门用户列表失败' });
  }
});

/** POST /api/departments — 新增部门节点 */
router.post('/', (req, res) => {
  const { name, parent_id, category } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '部门名称不能为空' });
  }
  if (!category || !['budget_unit', 'finance_system', 'bank_system'].includes(category)) {
    return res.status(400).json({ error: '部门分类无效' });
  }

  // 如果有父节点，验证父节点存在且 category 一致
  if (parent_id) {
    const parent = getDepartmentById(parent_id);
    if (!parent) {
      return res.status(404).json({ error: '父部门不存在' });
    }
    if (parent.category !== category) {
      return res.status(400).json({ error: '子部门分类必须与父部门一致' });
    }
  }

  // 计算 sort_order（同级最大 + 1）
  const siblings = getChildDepartments(parent_id || null);
  // 但需要过滤同 category（对于顶级节点）
  const sameCategorySiblings = parent_id
    ? siblings
    : siblings.filter(s => s.category === category);
  const sort_order = sameCategorySiblings.length > 0
    ? Math.max(...sameCategorySiblings.map(s => s.sort_order)) + 1
    : 0;

  try {
    const dept = createDepartment({ name: name.trim(), parent_id: parent_id || null, category, sort_order });
    res.status(201).json(dept);
  } catch (err) {
    res.status(500).json({ error: '创建部门失败' });
  }
});

/** PUT /api/departments/reorder — 批量更新排序（需在其他 :id 路由前） */
router.put('/reorder', (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '请提供排序项数组' });
  }

  try {
    reorderDepartments(items);
    res.json({ message: '排序已更新' });
  } catch (err) {
    res.status(500).json({ error: '更新排序失败' });
  }
});

/** PUT /api/departments/:id — 更新部门名称 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const dept = getDepartmentById(id);
  if (!dept) {
    return res.status(404).json({ error: '部门不存在' });
  }

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '部门名称不能为空' });
  }

  try {
    updateDepartment(id, { name: name.trim() });
    const updated = getDepartmentById(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新部门失败' });
  }
});

/** PUT /api/departments/:id/move — 移动部门到新父节点 */
router.put('/:id/move', (req, res) => {
  const { id } = req.params;
  const { parent_id, sort_order } = req.body;

  const dept = getDepartmentById(id);
  if (!dept) {
    return res.status(404).json({ error: '部门不存在' });
  }

  // 不能移动到自己的子节点下
  if (parent_id) {
    const newParent = getDepartmentById(parent_id);
    if (!newParent) {
      return res.status(404).json({ error: '目标父部门不存在' });
    }
    if (newParent.category !== dept.category) {
      return res.status(400).json({ error: '不能跨分类移动部门' });
    }
    // 检查是否移动到自己的后代
    const allDescendants = getChildDepartments(id);
    const isDescendant = (targetId) => {
      if (parseInt(targetId) === parseInt(id)) return true;
      return allDescendants.some(d => parseInt(d.id) === parseInt(targetId));
    };
    if (isDescendant(parent_id)) {
      return res.status(400).json({ error: '不能将部门移动到自身或其子部门下' });
    }
  }

  try {
    moveDepartment(id, { parent_id: parent_id || null, sort_order });
    const updated = getDepartmentById(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '移动部门失败' });
  }
});

/** DELETE /api/departments/:id — 删除部门 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const dept = getDepartmentById(id);
  if (!dept) {
    return res.status(404).json({ error: '部门不存在' });
  }

  try {
    deleteDepartment(id);
    res.json({ message: '部门已删除' });
  } catch (err) {
    if (err.message && (err.message.includes('子部门') || err.message.includes('用户'))) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: '删除部门失败' });
  }
});

module.exports = router;
