/**
 * 财政端子部门迁移脚本
 * 为已有数据库：
 *   1. 在财政系统下新增"信息中心"和"监督局"子部门
 *   2. 将现有 finance1 分配到信息中心
 *   3. 创建 finance2 用户并分配到监督局
 *
 * 用法: node migrate-finance-depts.js
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'app.db');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'secondary-approval-salt').digest('hex');
}

async function migrate() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('数据库文件不存在，无需迁移（首次启动会自动创建）');
    return;
  }

  const buffer = fs.readFileSync(DB_PATH);
  const SQL = await initSqlJs();
  const db = new SQL.Database(buffer);

  console.log('开始财政端子部门迁移...');

  // 1. 查找财政系统顶级节点
  const financeRoot = db.exec("SELECT id FROM departments WHERE category = 'finance_system' AND parent_id IS NULL");
  let financeRootId;
  if (financeRoot.length > 0 && financeRoot[0].values.length > 0) {
    financeRootId = financeRoot[0].values[0][0];
    console.log(`找到财政系统顶级节点: id=${financeRootId}`);
  } else {
    console.log('财政系统顶级节点不存在，创建中...');
    db.run("INSERT INTO departments (name, parent_id, category, sort_order) VALUES ('财政系统', NULL, 'finance_system', 1)");
    const result = db.exec('SELECT last_insert_rowid()');
    financeRootId = result[0].values[0][0];
    console.log(`已创建财政系统顶级节点: id=${financeRootId}`);
  }

  // 2. 创建"信息中心"（如不存在）
  const infoExists = db.exec("SELECT id FROM departments WHERE name = '信息中心' AND category = 'finance_system'");
  let infoCenterId;
  if (infoExists.length > 0 && infoExists[0].values.length > 0) {
    infoCenterId = infoExists[0].values[0][0];
    console.log(`信息中心已存在: id=${infoCenterId}`);
  } else {
    db.run("INSERT INTO departments (name, parent_id, category, sort_order) VALUES ('信息中心', ?, 'finance_system', 0)", [financeRootId]);
    const result = db.exec('SELECT last_insert_rowid()');
    infoCenterId = result[0].values[0][0];
    console.log(`已创建信息中心: id=${infoCenterId}`);
  }

  // 3. 创建"监督局"（如不存在）
  const supervExists = db.exec("SELECT id FROM departments WHERE name = '监督局' AND category = 'finance_system'");
  let supervisionId;
  if (supervExists.length > 0 && supervExists[0].values.length > 0) {
    supervisionId = supervExists[0].values[0][0];
    console.log(`监督局已存在: id=${supervisionId}`);
  } else {
    db.run("INSERT INTO departments (name, parent_id, category, sort_order) VALUES ('监督局', ?, 'finance_system', 1)", [financeRootId]);
    const result = db.exec('SELECT last_insert_rowid()');
    supervisionId = result[0].values[0][0];
    console.log(`已创建监督局: id=${supervisionId}`);
  }

  // 4. 更新 finance1 所属部门为信息中心（仅当尚未分配时）
  const finance1 = db.exec("SELECT id, department_id FROM users WHERE username = 'finance1'");
  if (finance1.length > 0 && finance1[0].values.length > 0) {
    const [f1Id, f1DeptId] = finance1[0].values[0];
    if (!f1DeptId) {
      db.run('UPDATE users SET department_id = ? WHERE id = ?', [infoCenterId, f1Id]);
      console.log(`已将 finance1 (id=${f1Id}) 分配到信息中心`);
    } else {
      console.log(`finance1 已有部门分配 (department_id=${f1DeptId})，跳过`);
    }
  } else {
    console.log('finance1 用户不存在，跳过');
  }

  // 5. 创建 finance2 用户（监督局），如不存在
  const finance2 = db.exec("SELECT id FROM users WHERE username = 'finance2'");
  if (finance2.length === 0 || finance2[0].values.length === 0) {
    const pwdHash = hashPassword('finance2');
    db.run(
      "INSERT INTO users (username, password_hash, role, display_name, unit_name, bank_name, department_id) VALUES ('finance2', ?, 'FINANCE', '监督局管理员', NULL, NULL, ?)",
      [pwdHash, supervisionId]
    );
    console.log('已创建 finance2 用户（监督局管理员）');
  } else {
    console.log('finance2 已存在，跳过创建');
    // 确保已分配到监督局
    const f2 = db.exec("SELECT id, department_id FROM users WHERE username = 'finance2'");
    if (f2.length > 0 && f2[0].values.length > 0) {
      const [f2Id, f2DeptId] = f2[0].values[0];
      if (!f2DeptId) {
        db.run('UPDATE users SET department_id = ? WHERE id = ?', [supervisionId, f2Id]);
        console.log(`已将 finance2 分配到监督局`);
      }
    }
  }

  // 保存数据库
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('迁移完成！数据库已保存。');
  db.close();
}

migrate().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
