/**
 * 银行端布局
 */
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout, Typography, Button, Space } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import BankDashboard from '../pages/bank/BankDashboard';

const { Header, Content } = Layout;
const { Title } = Typography;

export default function BankLayout() {
  const { user, logout } = useAuth();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        background: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Title level={4} style={{ margin: 0 }}>银行端 - 审核管理</Title>
        <Space>
          <span>当前用户：{user?.display_name}</span>
          <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
        </Space>
      </Header>
      <Content className="page-content">
        <Routes>
          <Route index element={<BankDashboard />} />
        </Routes>
      </Content>
    </Layout>
  );
}
