/**
 * 应用根组件：路由配置
 * 三种角色各自独立的视图路径，通过 ProtectedRoute 守卫
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

import LoginPage from './auth/LoginPage';
import ChangePasswordPage from './auth/ChangePasswordPage';
import ProtectedRoute from './layouts/ProtectedRoute';

// 各角色布局（先引入占位，后续逐步实现）
import UnitLayout from './layouts/UnitLayout';
import BankLayout from './layouts/BankLayout';
import FinanceLayout from './layouts/FinanceLayout';

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Routes>
        {/* 登录页 */}
        <Route path="/login" element={<LoginPage />} />

        {/* 强制修改密码（不经过 ProtectedRoute，自行处理认证） */}
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* 单位端 */}
        <Route path="/unit/*" element={
          <ProtectedRoute allowedRoles={['UNIT']}>
            <UnitLayout />
          </ProtectedRoute>
        } />

        {/* 银行端 */}
        <Route path="/bank/*" element={
          <ProtectedRoute allowedRoles={['BANK']}>
            <BankLayout />
          </ProtectedRoute>
        } />

        {/* 财政端 */}
        <Route path="/finance/*" element={
          <ProtectedRoute allowedRoles={['FINANCE']}>
            <FinanceLayout />
          </ProtectedRoute>
        } />

        {/* 默认跳转到登录页 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ConfigProvider>
  );
}
