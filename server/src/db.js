/**
 * 数据库初始化模块
 * 使用 sql.js（纯 JavaScript SQLite 实现，无需原生编译）
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12;

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

// ==================== 数据库实例管理 ====================

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // 尝试从文件加载已有数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 启用 WAL 模式
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ==================== 查询辅助函数 ====================

/** 查询多行 */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** 查询单行 */
function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

/** 执行写操作（INSERT/UPDATE/DELETE） */
function dbRun(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  saveDb();
  return { changes };
}

// ==================== 密码哈希 ====================

/** 使用 bcrypt 哈希密码（异步） */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** 验证密码（异步） */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ==================== 用户数据（DB 持久化） ====================

/** 根据用户名查找用户 */
function findUser(username) {
  return queryOne('SELECT * FROM users WHERE username = ?', [username]);
}

/** 根据 ID 查找用户 */
function findUserById(id) {
  return queryOne('SELECT * FROM users WHERE id = ?', [id]);
}

/** 列出所有用户（不含密码哈希） */
function listUsers() {
  return queryAll(
    `SELECT u.id, u.username, u.role, u.display_name, u.unit_name, u.bank_name,
            u.department_id, u.is_active, u.created_at,
            d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     ORDER BY u.id`
  );
}

/** 按角色列出用户 */
function listUsersByRole(role) {
  return queryAll(
    `SELECT u.id, u.username, u.role, u.display_name, u.unit_name, u.bank_name,
            u.department_id, u.is_active, u.created_at,
            d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.role = ? ORDER BY u.id`,
    [role]
  );
}

/** 新增用户 */
async function createUser({ username, password, role, display_name, unit_name, bank_name, department_id }) {
  const password_hash = await hashPassword(password);
  dbRun(
    'INSERT INTO users (username, password_hash, role, display_name, unit_name, bank_name, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [username, password_hash, role, display_name, unit_name || null, bank_name || null, department_id || null]
  );
  return findUser(username);
}

/** 更新用户信息（显示名称、单位名称、银行名称、部门ID） */
function updateUser(id, { display_name, unit_name, bank_name, department_id }) {
  const sets = [];
  const params = [];
  if (display_name !== undefined) {
    sets.push('display_name = ?');
    params.push(display_name);
  }
  if (unit_name !== undefined) {
    sets.push('unit_name = ?');
    params.push(unit_name);
  }
  if (bank_name !== undefined) {
    sets.push('bank_name = ?');
    params.push(bank_name);
  }
  if (department_id !== undefined) {
    sets.push('department_id = ?');
    params.push(department_id);
  }
  if (sets.length === 0) return { changes: 0 };
  params.push(id);
  return dbRun(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** 重置用户密码为随机临时密码，返回新密码 */
async function resetPassword(id) {
  const crypto = require('crypto');
  const tempPassword = crypto.randomBytes(6).toString('hex');
  const newHash = await hashPassword(tempPassword);
  return {
    changes: dbRun('UPDATE users SET password_hash = ?, password_reset_required = 1 WHERE id = ?', [newHash, id]).changes,
    tempPassword,
  };
}

/** 修改密码并清除强制改密标记 */
function changePassword(id, newHash) {
  return dbRun(
    'UPDATE users SET password_hash = ?, password_reset_required = 0 WHERE id = ?',
    [newHash, id]
  );
}

/** 删除用户 */
function deleteUser(id) {
  return dbRun('DELETE FROM users WHERE id = ?', [id]);
}

// ==================== 部门管理（组织架构树）====================

/** 查询所有部门 */
function listDepartments() {
  return queryAll('SELECT * FROM departments ORDER BY category, sort_order, id');
}

/** 按 ID 查询部门 */
function getDepartmentById(id) {
  return queryOne('SELECT * FROM departments WHERE id = ?', [id]);
}

/** 按分类查询顶级部门 */
function getRootDepartments(category) {
  return queryAll(
    'SELECT * FROM departments WHERE category = ? AND parent_id IS NULL ORDER BY sort_order, id',
    [category]
  );
}

/** 按父部门 ID 查询子部门（支持 null 查询顶级节点） */
function getChildDepartments(parentId) {
  if (parentId === null || parentId === undefined) {
    return queryAll('SELECT * FROM departments WHERE parent_id IS NULL ORDER BY sort_order, id');
  }
  return queryAll(
    'SELECT * FROM departments WHERE parent_id = ? ORDER BY sort_order, id',
    [parentId]
  );
}

/**
 * 递归获取某部门的所有后代部门 ID（不含自身）
 * @param {number} parentId
 * @returns {number[]}
 */
function getDescendantDepartmentIds(parentId) {
  const result = [];
  const children = getChildDepartments(parentId);
  for (const child of children) {
    result.push(child.id);
    const descendants = getDescendantDepartmentIds(child.id);
    result.push(...descendants);
  }
  return result;
}

/** 构建完整部门树（嵌套 JSON） */
function buildDepartmentTree() {
  const all = listDepartments();
  const map = {};
  const roots = [];

  // 建立 id -> node 映射，初始化 children 数组
  for (const d of all) {
    map[d.id] = { ...d, children: [] };
  }

  // 组装父子关系
  for (const d of all) {
    const node = map[d.id];
    if (d.parent_id && map[d.parent_id]) {
      map[d.parent_id].children.push(node);
    } else if (!d.parent_id) {
      roots.push(node);
    }
  }

  // 按 sort_order 排序每个节点的 children
  const sortChildren = (node) => {
    node.children.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return roots;
}

/** 新增部门 */
function createDepartment({ name, parent_id, category, sort_order }) {
  dbRun(
    'INSERT INTO departments (name, parent_id, category, sort_order) VALUES (?, ?, ?, ?)',
    [name, parent_id || null, category, sort_order || 0]
  );
  // last_insert_rowid() 在 sql.js 中跨 prepare 可能失效，改用 MAX(id)
  const row = queryOne('SELECT MAX(id) as id FROM departments');
  return queryOne('SELECT * FROM departments WHERE id = ?', [row ? row.id : 1]);
}

/** 更新部门 */
function updateDepartment(id, { name, sort_order }) {
  const sets = [];
  const params = [];
  if (name !== undefined) {
    sets.push('name = ?');
    params.push(name);
  }
  if (sort_order !== undefined) {
    sets.push('sort_order = ?');
    params.push(sort_order);
  }
  if (sets.length === 0) return { changes: 0 };
  sets.push("updated_at = datetime('now','localtime')");
  params.push(id);
  return dbRun(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** 删除部门（仅当无子部门且无关联用户时允许） */
function deleteDepartment(id) {
  const children = getChildDepartments(id);
  if (children.length > 0) {
    throw new Error('该部门下存在子部门，请先删除子部门');
  }
  // 检查是否存在关联用户
  const userCount = queryOne('SELECT COUNT(*) as cnt FROM users WHERE department_id = ?', [id]);
  if (userCount && userCount.cnt > 0) {
    throw new Error(`该部门下存在 ${userCount.cnt} 个用户，请先将用户移至其他部门后再删除`);
  }
  return dbRun('DELETE FROM departments WHERE id = ?', [id]);
}

/** 移动部门到新父节点 */
function moveDepartment(id, { parent_id, sort_order }) {
  const sets = ['parent_id = ?'];
  const params = [parent_id || null];
  if (sort_order !== undefined) {
    sets.push('sort_order = ?');
    params.push(sort_order);
  }
  sets.push("updated_at = datetime('now','localtime')");
  params.push(id);
  return dbRun(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** 批量更新排序（拖拽后重排同层节点） */
function reorderDepartments(items) {
  const stmt = db.prepare('UPDATE departments SET sort_order = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?');
  for (const item of items) {
    stmt.run([item.sort_order, item.id]);
  }
  stmt.free();
  saveDb();
  return { changes: items.length };
}

/** 按部门 ID 查询用户列表 */
function listUsersByDepartment(departmentId) {
  return queryAll(
    `SELECT u.id, u.username, u.role, u.display_name, u.unit_name, u.bank_name,
            u.department_id, u.is_active, u.created_at,
            d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.department_id = ?
     ORDER BY u.id`,
    [departmentId]
  );
}

/**
 * 按多个部门 ID 查询用户列表（用于递归汇总根节点下的所有用户）
 * @param {number[]} departmentIds
 * @returns {object[]}
 */
function listUsersByDepartments(departmentIds) {
  if (!departmentIds || departmentIds.length === 0) {
    return [];
  }
  const placeholders = departmentIds.map(() => '?').join(',');
  return queryAll(
    `SELECT u.id, u.username, u.role, u.display_name, u.unit_name, u.bank_name,
            u.department_id, u.is_active, u.created_at,
            d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.department_id IN (${placeholders})
     ORDER BY u.id`,
    departmentIds
  );
}

// ==================== 数据库初始化 ====================

function initSchema() {
  // 用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('UNIT','BANK','FINANCE')),
      display_name  TEXT NOT NULL,
      unit_name     TEXT,
      bank_name     TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 申请表（去掉 amount，新增 assigned_bank、batch_id）
  db.run(`
    CREATE TABLE IF NOT EXISTS secondary_issue_application (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      application_no  TEXT NOT NULL UNIQUE,
      project_name    TEXT NOT NULL,
      issue_no        TEXT NOT NULL,
      assigned_bank   TEXT NOT NULL,
      reason          TEXT,
      applicant       TEXT NOT NULL,
      unit_name       TEXT NOT NULL,
      application_date TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK(status IN ('PENDING','ISSUED','RETURNED')),
      auditor         TEXT,
      audit_date      TEXT,
      audit_remark    TEXT,
      returned_by     TEXT,
      return_date     TEXT,
      return_reason   TEXT,
      batch_id        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_issue_no ON secondary_issue_application(issue_no)');
  db.run('CREATE INDEX IF NOT EXISTS idx_status ON secondary_issue_application(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_applicant ON secondary_issue_application(applicant)');
  db.run('CREATE INDEX IF NOT EXISTS idx_assigned_bank ON secondary_issue_application(assigned_bank)');
  db.run('CREATE INDEX IF NOT EXISTS idx_batch_id ON secondary_issue_application(batch_id)');

  // 兼容已有数据库：新增 batch_id 列
  try { db.run('ALTER TABLE secondary_issue_application ADD COLUMN batch_id TEXT'); } catch (e) { /* 列已存在 */ }

  // 部门表（组织架构树）
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('budget_unit','finance_system','bank_system')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_dept_parent ON departments(parent_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_dept_category ON departments(category)');

  // users 表扩展：department_id + is_active（兼容已有数据库，忽略列已存在错误）
  try { db.run('ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL'); } catch (e) { /* 列已存在 */ }
  try { db.run('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1'); } catch (e) { /* 列已存在 */ }
  try { db.run('ALTER TABLE users ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* 列已存在 */ }
}

async function seedUsers() {
  const count = queryOne('SELECT COUNT(*) as cnt FROM users');
  if (count && count.cnt > 0) return;

  const seeds = [
    { username: 'unit1',    password: 'unit1',    role: 'UNIT',    display_name: '单位操作员A', unit_name: '施工单位A', bank_name: null },
    { username: 'unit2',    password: 'unit2',    role: 'UNIT',    display_name: '单位操作员B', unit_name: '施工单位B', bank_name: null },
    { username: 'bank1',    password: 'bank1',    role: 'BANK',    display_name: '银行审核员A', unit_name: null,          bank_name: '中国农业银行' },
    { username: 'bank2',    password: 'bank2',    role: 'BANK',    display_name: '银行审核员B', unit_name: null,          bank_name: '中国农商银行' },
    { username: 'finance1', password: 'finance1', role: 'FINANCE', display_name: '财政管理员',   unit_name: null,          bank_name: null },
  ];

  const stmt = db.prepare(
    'INSERT INTO users (username, password_hash, role, display_name, unit_name, bank_name) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (const u of seeds) {
    stmt.run([u.username, await hashPassword(u.password), u.role, u.display_name, u.unit_name, u.bank_name]);
  }
  stmt.free();
  saveDb();
  console.log(`已插入 ${seeds.length} 条用户种子数据`);
}

function seedApplications() {
  const count = queryOne('SELECT COUNT(*) as cnt FROM secondary_issue_application');
  if (count && count.cnt > 0) return;

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  const seeds = [
    { application_no: 'SQ2026061600001', project_name: '市政道路维护工程', issue_no: '2026-411381-GLJT-91163218',   assigned_bank: 'bank1', reason: '工程进度款支付', applicant: 'unit1', unit_name: '施工单位A', application_date: fmt(now), status: 'PENDING' },
    { application_no: 'SQ2026061600002', project_name: '桥梁加固项目',     issue_no: '2026-411381-GLJT-91163218',   assigned_bank: 'bank1', reason: '二期工程款',     applicant: 'unit1', unit_name: '施工单位A', application_date: fmt(now), status: 'PENDING' },
    { application_no: 'SQ2026061600003', project_name: '河道治理工程',     issue_no: '2026-411381-GLJT-91163218',   assigned_bank: 'bank1', reason: '材料款支付',     applicant: 'unit1', unit_name: '施工单位A', application_date: fmt(now), status: 'ISSUED',  auditor: 'bank1', audit_date: fmt(now), audit_remark: '材料齐全，同意发放' },
    { application_no: 'SQ2026061600004', project_name: '学校扩建项目',     issue_no: '2026-411381-XXGC-20260001',   assigned_bank: 'bank1', reason: '主体结构施工',   applicant: 'unit1', unit_name: '施工单位A', application_date: fmt(now), status: 'PENDING' },
    { application_no: 'SQ2026061600005', project_name: '医院改造工程',     issue_no: '2026-411381-XXGC-20260001',   assigned_bank: 'bank1', reason: '装修工程款',     applicant: 'unit1', unit_name: '施工单位A', application_date: fmt(now), status: 'RETURNED', returned_by: 'bank1', return_date: fmt(now), return_reason: '发放单号与项目不符，请核实后重新提交' },
    { application_no: 'SQ2026061600006', project_name: '污水处理项目',     issue_no: '2026-411381-WSCL-20260002',   assigned_bank: 'bank2', reason: '设备采购款',     applicant: 'unit2', unit_name: '施工单位B', application_date: fmt(now), status: 'PENDING' },
    { application_no: 'SQ2026061600007', project_name: '管网改造项目',     issue_no: '2026-411381-WSCL-20260002',   assigned_bank: 'bank2', reason: '管道铺设费用',   applicant: 'unit2', unit_name: '施工单位B', application_date: fmt(now), status: 'PENDING' },
  ];

  const stmt = db.prepare(`
    INSERT INTO secondary_issue_application
      (application_no, project_name, issue_no, assigned_bank, reason, applicant, unit_name, application_date, status, auditor, audit_date, audit_remark, returned_by, return_date, return_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of seeds) {
    stmt.run([
      s.application_no, s.project_name, s.issue_no, s.assigned_bank, s.reason,
      s.applicant, s.unit_name, s.application_date, s.status,
      s.auditor || null, s.audit_date || null, s.audit_remark || null,
      s.returned_by || null, s.return_date || null, s.return_reason || null,
    ]);
  }
  stmt.free();
  saveDb();
  console.log(`已插入 ${seeds.length} 条申请种子数据`);
}

/** 部门种子数据：三大顶级分类 + 现有单位作为预算单位子节点 */
function seedDepartments() {
  const count = queryOne('SELECT COUNT(*) as cnt FROM departments');
  if (count && count.cnt > 0) return;

  // 插入三大顶级分类
  dbRun('INSERT INTO departments (name, parent_id, category, sort_order) VALUES (?, NULL, ?, ?)',
    ['预算单位', 'budget_unit', 0]);
  dbRun('INSERT INTO departments (name, parent_id, category, sort_order) VALUES (?, NULL, ?, ?)',
    ['财政系统', 'finance_system', 1]);
  dbRun('INSERT INTO departments (name, parent_id, category, sort_order) VALUES (?, NULL, ?, ?)',
    ['银行系统', 'bank_system', 2]);

  // 将现有单位用户的 unit_name 作为子节点插入到预算单位下
  const budgetRoot = queryOne("SELECT id FROM departments WHERE category = 'budget_unit' AND parent_id IS NULL");
  if (budgetRoot) {
    const unitUsers = queryAll("SELECT DISTINCT unit_name FROM users WHERE role = 'UNIT' AND unit_name IS NOT NULL ORDER BY unit_name");
    unitUsers.forEach((u, idx) => {
      dbRun('INSERT INTO departments (name, parent_id, category, sort_order) VALUES (?, ?, ?, ?)',
        [u.unit_name, budgetRoot.id, 'budget_unit', idx]);
    });
  }

  // 在财政系统分类下插入"信息中心"和"监督局"两个子部门
  const financeRoot = queryOne("SELECT id FROM departments WHERE category = 'finance_system' AND parent_id IS NULL");
  if (financeRoot) {
    dbRun('INSERT INTO departments (name, parent_id, category, sort_order) VALUES (?, ?, ?, ?)',
      ['信息中心', financeRoot.id, 'finance_system', 0]);
    dbRun('INSERT INTO departments (name, parent_id, category, sort_order) VALUES (?, ?, ?, ?)',
      ['监督局', financeRoot.id, 'finance_system', 1]);
  }

  saveDb();
  console.log('已插入部门种子数据');
}

/** 将财政端用户分配到对应部门（需在 seedDepartments 之后调用） */
async function seedFinanceDepartmentAssignments() {
  // 查找信息中心和监督局的部门 ID
  const infoCenter = queryOne("SELECT id FROM departments WHERE name = '信息中心' AND category = 'finance_system'");
  const supervision = queryOne("SELECT id FROM departments WHERE name = '监督局' AND category = 'finance_system'");

  if (!infoCenter || !supervision) return; // 部门尚未创建

  // 将 finance1 分配到信息中心
  const finance1 = findUser('finance1');
  if (finance1 && !finance1.department_id) {
    dbRun('UPDATE users SET department_id = ? WHERE id = ?', [infoCenter.id, finance1.id]);
    console.log(`已将 finance1 分配到部门：信息中心 (id=${infoCenter.id})`);
  }

  // 创建 finance2（监督局用户），如果不存在
  const finance2 = findUser('finance2');
  if (!finance2) {
    const password_hash = await hashPassword('finance2');
    dbRun(
      'INSERT INTO users (username, password_hash, role, display_name, unit_name, bank_name, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['finance2', password_hash, 'FINANCE', '监督局管理员', null, null, supervision.id]
    );
    console.log(`已创建 finance2 用户，分配到部门：监督局 (id=${supervision.id})`);
  }
}

async function initDb() {
  await getDb();
  initSchema();
  await seedUsers();
  seedApplications();
  seedDepartments();
  await seedFinanceDepartmentAssignments();
  console.log('数据库初始化完成');
  return db;
}

module.exports = {
  getDb,
  saveDb,
  initDb,
  queryAll,
  queryOne,
  dbRun,
  findUser,
  findUserById,
  listUsers,
  listUsersByRole,
  createUser,
  updateUser,
  resetPassword,
  changePassword,
  deleteUser,
  hashPassword,
  verifyPassword,
  // 部门管理
  listDepartments,
  getDepartmentById,
  getRootDepartments,
  getChildDepartments,
  buildDepartmentTree,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  moveDepartment,
  reorderDepartments,
  listUsersByDepartment,
  getDescendantDepartmentIds,
  listUsersByDepartments,
  // 种子数据
  seedFinanceDepartmentAssignments,
};
