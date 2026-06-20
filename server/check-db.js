const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/app.db');
  const db = new SQL.Database(buf);

  console.log('=== 财政系统子部门 ===');
  const depts = db.exec("SELECT d.id, d.name, d.category, d.parent_id FROM departments d WHERE d.category = 'finance_system'");
  if (depts.length > 0) {
    depts[0].values.forEach(row => console.log(JSON.stringify(row)));
  }

  console.log('\n=== 财政端用户 ===');
  const users = db.exec("SELECT u.username, u.role, u.display_name, u.department_id, d.name as dept_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.role = 'FINANCE'");
  if (users.length > 0) {
    users[0].values.forEach(row => console.log(JSON.stringify(row)));
  }

  db.close();
})();
