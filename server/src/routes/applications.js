/**
 * 业务路由：申请的增删改查 + 审核 + 退回 + 重提 + 汇总 + 明细
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { getDb, queryAll, queryOne, dbRun } = require('../db');

/** 生成申请单号：SQ + 日期(YYYYMMDD) + 5位序号（使用 MAX 避免删除后重复） */
function generateApplicationNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `SQ${y}${m}${d}`;

  const row = queryOne(
    "SELECT COALESCE(MAX(CAST(SUBSTR(application_no, 11) AS INTEGER)), 0) as max_seq FROM secondary_issue_application WHERE application_no LIKE ?",
    [`${prefix}%`]
  );
  const seq = String((row ? row.max_seq : 0) + 1).padStart(5, '0');
  return `${prefix}${seq}`;
}

/** 获取当前时间字符串 */
function now() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ==================== 所有接口均需认证 ====================
router.use(authMiddleware);

// ==================== GET /api/applications — 角色过滤列表 ====================
router.get('/', (req, res) => {
  const { role, username } = req.user;
  const { status } = req.query;

  let sql = `SELECT a.*, u.bank_name FROM secondary_issue_application a
             LEFT JOIN users u ON a.assigned_bank = u.username`;
  const conditions = [];
  const params = [];

  // 角色数据隔离
  if (role === 'UNIT') {
    conditions.push('a.applicant = ?');
    params.push(username);
  } else if (role === 'BANK') {
    // 银行端只看分配给自己的申请
    conditions.push('a.assigned_bank = ?');
    params.push(username);
  }
  // FINANCE 看全量

  // 状态筛选
  if (status && ['PENDING', 'ISSUED', 'RETURNED'].includes(status)) {
    conditions.push('a.status = ?');
    params.push(status);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY a.id DESC';

  const rows = queryAll(sql, params);
  res.json({ data: rows, total: rows.length });
});

// ==================== DELETE /api/applications/batch — 批量删除申请（FINANCE） ====================
router.delete('/batch', roleCheck('FINANCE'), (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供要删除的申请 ID 列表' });
  }

  // 逐条校验：记录必须存在且状态为 ISSUED
  const invalidIds = [];
  for (const id of ids) {
    const app = queryOne('SELECT id, application_no, status FROM secondary_issue_application WHERE id = ?', [id]);
    if (!app) {
      invalidIds.push({ id, reason: '记录不存在' });
    } else if (app.status !== 'ISSUED') {
      invalidIds.push({ id, application_no: app.application_no, reason: `当前状态为${app.status === 'PENDING' ? '待银行审核' : '已退回'}，仅可删除已发放的记录` });
    }
  }

  if (invalidIds.length > 0) {
    const details = invalidIds.map(i =>
      i.application_no ? `[${i.application_no}] ${i.reason}` : `ID=${i.id} ${i.reason}`
    ).join('；');
    return res.status(400).json({ error: `以下申请不符合删除条件：${details}` });
  }

  // 全部校验通过，执行批量删除
  for (const id of ids) {
    dbRun('DELETE FROM secondary_issue_application WHERE id = ?', [id]);
  }

  res.json({ message: `已删除 ${ids.length} 条申请记录`, deleted: ids.length });
});

/** 生成批次 ID（UUID v4 或时间戳兜底） */
function generateBatchId() {
  const crypto = require('crypto');
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

/** 校验并创建单条申请记录，返回插入后的记录（含 bank_name） */
function createOneApplication({ project_name, issue_no, assigned_bank, reason, applicant, unit_name, batch_id }) {
  if (!project_name || !issue_no || !assigned_bank) {
    throw new Error('项目名称、发放单号和分配银行为必填项');
  }
  if (project_name.length > 100) {
    throw new Error('项目名称不能超过100个字符');
  }
  if (reason && reason.length > 500) {
    throw new Error('申请理由不能超过500个字符');
  }
  // 校验 assigned_bank
  const bankUser = queryOne('SELECT username FROM users WHERE username = ? AND role = ?', [assigned_bank, 'BANK']);
  if (!bankUser) {
    throw new Error('指定的银行用户不存在');
  }

  const application_no = generateApplicationNo();
  const application_date = now();

  dbRun(
    `INSERT INTO secondary_issue_application
      (application_no, project_name, issue_no, assigned_bank, reason, applicant, unit_name, application_date, status, batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [application_no, project_name.trim(), issue_no.trim(), assigned_bank,
     reason || '', applicant, unit_name || '', application_date, batch_id || null]
  );

  return queryOne(
    `SELECT a.*, u.bank_name FROM secondary_issue_application a
     LEFT JOIN users u ON a.assigned_bank = u.username
     WHERE a.application_no = ?`,
    [application_no]
  );
}

// ==================== POST /api/applications — 创建申请（UNIT） ====================
// 支持两种格式：
//   旧版（兼容）：{ project_name, issue_no, assigned_bank, reason?, unit_name? }
//   新版（批量）：{ assigned_bank, unit_name?, projects: [{ project_name, issue_nos: [], reason? }] }
router.post('/', roleCheck('UNIT'), (req, res) => {
  try {
    const { assigned_bank, unit_name, projects } = req.body;
    const applicant = req.user.username;

    // -------------------- 新版：批量项目创建 --------------------
    if (projects && Array.isArray(projects)) {
      if (!assigned_bank) {
        return res.status(400).json({ error: '分配银行为必填项' });
      }
      if (projects.length === 0) {
        return res.status(400).json({ error: '请至少添加一个项目' });
      }

      const batch_id = generateBatchId();
      const created = [];

      for (const proj of projects) {
        const { project_name, issue_nos, reason } = proj;

        if (!project_name) {
          return res.status(400).json({ error: '每个项目都需要填写项目名称' });
        }
        if (!issue_nos || !Array.isArray(issue_nos) || issue_nos.length === 0) {
          return res.status(400).json({ error: `项目"${project_name}"至少需要一个发放单号` });
        }

        for (const issue_no of issue_nos) {
          if (!issue_no || !issue_no.trim()) {
            return res.status(400).json({ error: `项目"${project_name}"的发放单号不能为空` });
          }
          const record = createOneApplication({
            project_name: project_name.trim(),
            issue_no: issue_no.trim(),
            assigned_bank,
            reason: reason || '',
            applicant,
            unit_name: unit_name || '',
            batch_id,
          });
          created.push(record);
        }
      }

      return res.status(201).json({
        count: created.length,
        batch_id,
        applications: created,
      });
    }

    // -------------------- 旧版：单条创建（兼容） --------------------
    const { project_name, issue_no, reason } = req.body;
    const record = createOneApplication({
      project_name,
      issue_no,
      assigned_bank,
      reason,
      applicant,
      unit_name,
    });
    res.status(201).json(record);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '申请单号生成冲突，请稍后重试' });
    }
    // createOneApplication 抛出的校验错误
    if (err.message && (err.message.includes('必填') || err.message.includes('不能') || err.message.includes('不存在') || err.message.includes('至少'))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('创建申请错误:', err);
    res.status(500).json({ error: '创建申请失败，请稍后重试' });
  }
});

// ==================== PUT /api/applications/:id/audit — 审核通过（BANK） ====================
router.put('/:id/audit', roleCheck('BANK'), (req, res) => {
  const { id } = req.params;
  const { audit_remark } = req.body;

  const app = queryOne('SELECT * FROM secondary_issue_application WHERE id = ?', [id]);
  if (!app) {
    return res.status(404).json({ error: '申请不存在' });
  }
  if (app.status !== 'PENDING') {
    return res.status(400).json({ error: '该申请当前状态不允许审核操作' });
  }
  // 银行只能审核分配给自己的申请
  if (app.assigned_bank !== req.user.username) {
    return res.status(403).json({ error: '无权审核其他银行的申请' });
  }

  const audit_date = now();

  dbRun(
    `UPDATE secondary_issue_application
     SET status = 'ISSUED', auditor = ?, audit_date = ?, audit_remark = ?,
         updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [req.user.username, audit_date, audit_remark || null, id]
  );

  const updated = queryOne(
    `SELECT a.*, u.bank_name FROM secondary_issue_application a
     LEFT JOIN users u ON a.assigned_bank = u.username
     WHERE a.id = ?`,
    [id]
  );
  res.json(updated);
});

// ==================== PUT /api/applications/:id/return — 退回申请（BANK） ====================
router.put('/:id/return', roleCheck('BANK'), (req, res) => {
  const { id } = req.params;
  const { return_reason } = req.body;

  if (!return_reason || !return_reason.trim()) {
    return res.status(400).json({ error: '退回原因不能为空' });
  }

  const app = queryOne('SELECT * FROM secondary_issue_application WHERE id = ?', [id]);
  if (!app) {
    return res.status(404).json({ error: '申请不存在' });
  }
  if (app.status !== 'PENDING') {
    return res.status(400).json({ error: '该申请当前状态不允许退回操作' });
  }
  // 银行只能退回分配给自己的申请
  if (app.assigned_bank !== req.user.username) {
    return res.status(403).json({ error: '无权退回其他银行的申请' });
  }

  const return_date = now();

  dbRun(
    `UPDATE secondary_issue_application
     SET status = 'RETURNED', returned_by = ?, return_date = ?, return_reason = ?,
         updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [req.user.username, return_date, return_reason.trim(), id]
  );

  const updated = queryOne(
    `SELECT a.*, u.bank_name FROM secondary_issue_application a
     LEFT JOIN users u ON a.assigned_bank = u.username
     WHERE a.id = ?`,
    [id]
  );
  res.json(updated);
});

// ==================== PUT /api/applications/:id/resubmit — 重提申请（UNIT） ====================
router.put('/:id/resubmit', roleCheck('UNIT'), (req, res) => {
  const { id } = req.params;
  const { project_name, issue_no, assigned_bank, reason, unit_name } = req.body;

  const app = queryOne('SELECT * FROM secondary_issue_application WHERE id = ?', [id]);
  if (!app) {
    return res.status(404).json({ error: '申请不存在' });
  }
  if (app.status !== 'RETURNED') {
    return res.status(400).json({ error: '仅可重提被退回的申请' });
  }
  // 只能重提自己的申请
  if (app.applicant !== req.user.username) {
    return res.status(403).json({ error: '只能修改自己单位的申请' });
  }

  // 校验
  if (!project_name || !issue_no || !assigned_bank) {
    return res.status(400).json({ error: '项目名称、发放单号和分配银行为必填项' });
  }
  // 校验 assigned_bank
  const bankUser = queryOne('SELECT username FROM users WHERE username = ? AND role = ?', [assigned_bank, 'BANK']);
  if (!bankUser) {
    return res.status(400).json({ error: '指定的银行用户不存在' });
  }

  dbRun(
    `UPDATE secondary_issue_application
     SET project_name = ?, issue_no = ?, assigned_bank = ?, reason = ?, unit_name = ?,
         status = 'PENDING',
         returned_by = NULL, return_date = NULL, return_reason = NULL,
         auditor = NULL, audit_date = NULL, audit_remark = NULL,
         updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [project_name.trim(), issue_no.trim(), assigned_bank,
     reason || '', unit_name || '', id]
  );

  const updated = queryOne(
    `SELECT a.*, u.bank_name FROM secondary_issue_application a
     LEFT JOIN users u ON a.assigned_bank = u.username
     WHERE a.id = ?`,
    [id]
  );
  res.json(updated);
});

// ==================== GET /api/applications/summary — 汇总报表（FINANCE） ====================
router.get('/summary', roleCheck('FINANCE'), (req, res) => {
  const rows = queryAll(
    `SELECT
      issue_no,
      GROUP_CONCAT(DISTINCT project_name) as project_names,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status = 'ISSUED' THEN 1 ELSE 0 END) as issued_count,
      SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) as returned_count
     FROM secondary_issue_application
     GROUP BY issue_no
     ORDER BY issue_no DESC`
  );
  res.json({ data: rows });
});

// ==================== GET /api/applications/by-issue/:issueNo — 穿透明细（FINANCE） ====================
router.get('/by-issue/:issueNo', roleCheck('FINANCE'), (req, res) => {
  const { issueNo } = req.params;
  const rows = queryAll(
    `SELECT a.*, u.bank_name FROM secondary_issue_application a
     LEFT JOIN users u ON a.assigned_bank = u.username
     WHERE a.issue_no = ?
     ORDER BY a.id DESC`,
    [issueNo]
  );
  res.json({ data: rows, issue_no: issueNo, total: rows.length });
});

module.exports = router;
