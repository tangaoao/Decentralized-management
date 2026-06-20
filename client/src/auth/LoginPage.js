/**
 * 登录页
 * 登录成功后根据角色自动跳转到对应页面
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Space } from 'antd';
import { UserOutlined, LockOutlined, AuditOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';

const { Title, Text } = Typography;

/** 角色对应的首页路径 */
function getHomePath(role) {
  switch (role) {
    case 'UNIT':    return '/unit';
    case 'BANK':    return '/bank';
    case 'FINANCE': return '/finance';
    default:        return '/login';
  }
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const user = await login(values.username, values.password);
      console.log('🔍 登录返回 user:', user);
      console.log('🔍 password_reset_required =', user.password_reset_required, ', 类型:', typeof user.password_reset_required);
      if (user.password_reset_required) {
        message.warning('您的密码已被管理员重置，请设置新密码');
        navigate('/change-password', { replace: true });
      } else {
        message.success(`欢迎，${user.display_name}`);
        navigate(getHomePath(user.role), { replace: true });
      }
    } catch (err) {
      const msg = err.response?.data?.error || '登录失败，请重试';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%', textAlign: 'center' }}>
          <AuditOutlined style={{ fontSize: 48, color: '#667eea' }} />
          <Title level={3} style={{ margin: 0 }}>二次发放审批系统</Title>
          <Text type="secondary">单位端 · 银行端 · 财政端</Text>
        </Space>

        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          style={{ marginTop: 24 }}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" autoFocus />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登 录
            </Button>
          </Form.Item>
        </Form>

        {process.env.REACT_APP_SHOW_TEST_CREDENTIALS === 'true' && (
          <Card size="small" style={{ background: '#fafafa' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              测试账号：unit1/unit1（单位）｜ bank1/bank1（银行）｜ finance1/finance1（财政）
            </Text>
          </Card>
        )}
      </Card>
    </div>
  );
}
