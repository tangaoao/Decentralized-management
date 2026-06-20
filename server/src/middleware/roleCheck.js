/**
 * 角色权限守卫工厂函数
 * 用法：router.post('/', auth, roleCheck('UNIT'), handler)
 */
function roleCheck(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足，当前角色无法执行此操作' });
    }
    next();
  };
}

module.exports = roleCheck;
