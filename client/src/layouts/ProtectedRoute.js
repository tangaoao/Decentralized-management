/**
 * 路由守卫：检查认证状态和角色权限
 * 未登录 → 跳转 /login
 * 角色不匹配 → 跳转 /login
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Spin } from 'antd';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, token, loading } = useAuth();

  // 正在验证 token
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  // 未登录
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // 角色不匹配
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  // 强制修改密码：管理员重置密码后禁止访问任何受保护页面
  if (user.password_reset_required) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}
