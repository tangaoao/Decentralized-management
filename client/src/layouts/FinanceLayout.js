/**
 * 财政端布局：可折叠侧边导航 + 子路由渲染
 * 根据用户所属部门（信息中心/监督局）显示不同菜单
 */
import React, { useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Button, Space, Result } from 'antd';
import {
  LogoutOutlined,
  PieChartOutlined,
  UnorderedListOutlined,
  TeamOutlined,
  ApartmentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import SummaryReport from '../pages/finance/SummaryReport';
import IssueDetail from '../pages/finance/IssueDetail';
import AllApplicationsPage from '../pages/finance/AllApplicationsPage';
import UserManagementPage from '../pages/finance/UserManagementPage';
import DepartmentManagementPage from '../pages/finance/DepartmentManagementPage';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

/** 无权限提示组件 */
function NoPermission({ message = '您没有权限访问此页面' }) {
  return (
    <Result
      status="403"
      title="无权限"
      subTitle={message}
    />
  );
}

export default function FinanceLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);

  // 判断当前用户是否属于信息中心（管理员）
  const isInfoCenter = user?.department_name === '信息中心';

  // 侧边栏菜单配置：监督局用户仅显示前两项
  const menuItems = useMemo(() => {
    const items = [
      { key: '/finance/summary',      icon: <PieChartOutlined />,      label: '汇总报表' },
      { key: '/finance/applications',  icon: <UnorderedListOutlined />, label: '全量申请列表' },
    ];
    if (isInfoCenter) {
      items.push(
        { key: '/finance/users',         icon: <TeamOutlined />,          label: '用户管理' },
        { key: '/finance/departments',   icon: <ApartmentOutlined />,     label: '部门管理' },
      );
    }
    return items;
  }, [isInfoCenter]);

  // 确定当前选中的菜单项
  const selectedKey = (() => {
    const path = location.pathname;
    // 明细页（/finance/issue/xxx）不匹配任何菜单，返回空避免误高亮
    if (path.startsWith('/finance/issue/')) return '';
    const match = menuItems.find(item => path.startsWith(item.key));
    return match ? match.key : '';
  })();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 左侧可折叠导航 */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="dark"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
        }}
      >
        <div style={{
          height: 32,
          margin: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Title level={5} style={{
            color: '#fff',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}>
            {collapsed ? '财政' : '财政端监管系统'}
          </Title>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />

        {/* 底部折叠按钮 */}
        <div style={{
          position: 'absolute',
          bottom: 16,
          width: '100%',
          textAlign: 'center',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16 }}
          />
        </div>
      </Sider>

      {/* 右侧主体 */}
      <Layout>
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
          height: 64,
        }}>
          <Title level={4} style={{ margin: 0 }}>财政端 - 全流程监管</Title>
          <Space>
            <span>当前用户：{user?.display_name}</span>
            <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
          </Space>
        </Header>

        <Content className="page-content">
          <Routes>
            <Route index element={<Navigate to="/finance/summary" replace />} />
            <Route path="summary" element={<SummaryReport />} />
            <Route path="issue/:issueNo" element={<IssueDetail />} />
            <Route path="applications" element={<AllApplicationsPage />} />
            {isInfoCenter && (
              <>
                <Route path="users" element={<UserManagementPage />} />
                <Route path="departments" element={<DepartmentManagementPage />} />
              </>
            )}
            {/* 监督局用户访问无权限页面 */}
            {!isInfoCenter && (
              <>
                <Route path="users" element={<NoPermission message="仅信息中心可管理用户" />} />
                <Route path="departments" element={<NoPermission message="仅信息中心可管理部门" />} />
              </>
            )}
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
