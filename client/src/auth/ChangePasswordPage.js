/**
 * 强制修改密码页面
 * 管理员重置密码后，用户首次登录必须设置新密码
 * 要求：两次输入一致 + 密码强度校验（长度≥8，字符类型≥3种）
 */
import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Space, Progress } from 'antd';
import { LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import { authAPI } from '../api';

const { Title, Text } = Typography;

/** 计算密码强度评分 0-4（长度1分 + 每种字符类型1分） */
function getStrength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

/** 客户端密码强度校验（与服务端规则一致） */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return Promise.reject(new Error('密码长度至少为8位'));
  }
  let types = 0;
  if (/[A-Z]/.test(password)) types++;
  if (/[a-z]/.test(password)) types++;
  if (/[0-9]/.test(password)) types++;
  if (/[^A-Za-z0-9]/.test(password)) types++;
  if (types < 3) {
    return Promise.reject(new Error('密码需包含大写字母、小写字母、数字、特殊字符中至少3种'));
  }
  return Promise.resolve();
}

export default function ChangePasswordPage() {
  const { user, token, updateAuth, getHomePath } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [password, setPassword] = useState('');

  // 未登录 → 跳转登录页
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await authAPI.changePassword(values.password, values.confirmPassword);
      const { token: newToken, user: newUser } = res.data;
      updateAuth(newToken, newUser);
      message.success('密码修改成功');
      navigate(getHomePath(newUser.role), { replace: true });
    } catch (err) {
      message.error(err.response?.data?.error || '修改密码失败');
    } finally {
      setLoading(false);
    }
  };

  const strength = getStrength(password);
  const strengthPercent = strength * 25;
  const strengthColors = ['#ff4d4f', '#ff7a45', '#faad14', '#52c41a', '#237804'];
  const strengthLabels = ['', '弱', '弱', '中', '强'];

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%', textAlign: 'center' }}>
          <SafetyOutlined style={{ fontSize: 48, color: '#faad14' }} />
          <Title level={3} style={{ margin: 0 }}>设置新密码</Title>
          <Text type="secondary">
            您的密码已被管理员重置，请设置一个新的安全密码
          </Text>
        </Space>

        <Form
          form={form}
          onFinish={onFinish}
          layout="vertical"
          style={{ marginTop: 24 }}
          size="large"
        >
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { validator: (_, value) => validatePassword(value || '') },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="至少8位，包含3种字符类型"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Item>

          {/* 密码强度实时指示器 */}
          {password && (
            <div style={{ marginTop: -16, marginBottom: 8 }}>
              <Progress
                percent={strengthPercent}
                showInfo={false}
                strokeColor={strengthColors[strength]}
                size="small"
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                密码强度：{strengthLabels[strength]}
                {strength < 3 ? '（需包含大写、小写、数字、特殊字符中至少3种）' : ''}
              </Text>
            </div>
          )}

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入新密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
