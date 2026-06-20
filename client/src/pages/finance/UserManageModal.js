/**
 * 用户管理弹窗：财政端可查看/新增/修改/重置密码/删除用户
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Input, Select, Space, message, Popconfirm, Typography, Card } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, LockOutlined } from '@ant-design/icons';
import { userAPI } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import ResizableTable from '../../components/ResizableTable';

const { Title } = Typography;

const ROLE_OPTIONS = [
  { value: 'UNIT', label: '单位用户' },
  { value: 'BANK', label: '银行用户' },
  { value: 'FINANCE', label: '财政用户' },
];

const ROLE_MAP = { UNIT: '单位用户', BANK: '银行用户', FINANCE: '财政用户' };

export default function UserManageModal({ visible, onCancel }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form] = Form.useForm();

  // ========== 修改用户相关状态 ==========
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm();

  // 监听角色变化以切换关联字段（新增表单）
  const [selectedRole, setSelectedRole] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userAPI.list();
      setUsers(res.data.data || []);
    } catch (err) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchUsers();
      setShowForm(false);
      form.resetFields();
    }
  }, [visible, fetchUsers, form]);

  // ========== 新增用户 ==========
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await userAPI.create(values);
      message.success('用户创建成功');
      setShowForm(false);
      form.resetFields();
      setSelectedRole(null);
      fetchUsers();
    } catch (err) {
      if (err.response) {
        message.error(err.response.data?.error || '创建失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ========== 打开修改弹窗 ==========
  const handleOpenEdit = (record) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      display_name: record.display_name,
      unit_name: record.unit_name || '',
      bank_name: record.bank_name || '',
    });
    setEditModalVisible(true);
  };

  // ========== 保存修改 ==========
  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setEditSubmitting(true);
      await userAPI.update(editingUser.id, values);
      message.success('用户信息已更新');
      setEditModalVisible(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      if (err.response) {
        message.error(err.response.data?.error || '修改失败');
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  // ========== 删除用户 ==========
  const handleDelete = async (id) => {
    try {
      await userAPI.delete(id);
      message.success('用户已删除');
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  // ========== 重置密码 ==========
  const handleResetPassword = async (id) => {
    try {
      const res = await userAPI.resetPassword(id);
      message.success(`密码已重置为：${res.data.tempPassword}`);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || '重置密码失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '用户名', dataIndex: 'username', width: 120 },
    {
      title: '角色', dataIndex: 'role', width: 100,
      render: r => ROLE_MAP[r] || r,
    },
    { title: '显示名称', dataIndex: 'display_name', width: 130 },
    {
      title: '关联名称', width: 160,
      render: (_, r) => {
        if (r.role === 'UNIT') return r.unit_name || '-';
        if (r.role === 'BANK') return r.bank_name || '-';
        return '-';
      },
    },
    { title: '创建时间', dataIndex: 'created_at', width: 170 },
    {
      title: '操作', width: 200,
      render: (_, record) => {
        const isSelf = record.id === currentUser?.id;
        return (
          <Space size={0}>
            {/* 修改按钮 */}
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            >
              修改
            </Button>

            {/* 重置密码 */}
            <Popconfirm
              title="重置密码"
              description="确定将该用户密码重置为 123456？"
              onConfirm={() => handleResetPassword(record.id)}
              okText="确定重置"
              cancelText="取消"
            >
              <Button
                type="link"
                icon={<LockOutlined />}
              >
                重置密码
              </Button>
            </Popconfirm>

            {/* 删除 */}
            <Popconfirm
              title={isSelf ? '不能删除自己' : `确定删除用户「${record.username}」？`}
              onConfirm={() => !isSelf && handleDelete(record.id)}
              okText="确定删除"
              cancelText="取消"
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                disabled={isSelf}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Modal
        title="用户管理"
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={1000}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0 }}>所有用户</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setShowForm(!showForm); form.resetFields(); setSelectedRole(null); }}
          >
            {showForm ? '取消新增' : '新增用户'}
          </Button>
        </Space>

        {/* 新增用户表单 */}
        {showForm && (
          <Card style={{ marginBottom: 16 }} size="small">
            <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Form.Item
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 2, max: 50, message: '2-50个字符' },
                ]}
              >
                <Input placeholder="用户名" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 4, message: '至少4个字符' },
                ]}
              >
                <Input.Password placeholder="密码" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item
                name="role"
                rules={[{ required: true, message: '请选择角色' }]}
              >
                <Select
                  placeholder="角色"
                  options={ROLE_OPTIONS}
                  style={{ width: 120 }}
                  onChange={setSelectedRole}
                />
              </Form.Item>
              <Form.Item
                name="display_name"
                rules={[{ required: true, message: '请输入显示名称' }]}
              >
                <Input placeholder="显示名称" style={{ width: 140 }} />
              </Form.Item>
              {selectedRole === 'UNIT' && (
                <Form.Item name="unit_name" rules={[{ required: true, message: '请输入单位名称' }]}>
                  <Input placeholder="单位名称" style={{ width: 160 }} />
                </Form.Item>
              )}
              {selectedRole === 'BANK' && (
                <Form.Item name="bank_name" rules={[{ required: true, message: '请输入银行名称' }]}>
                  <Input placeholder="银行名称" style={{ width: 160 }} />
                </Form.Item>
              )}
              <Form.Item>
                <Button type="primary" loading={submitting} onClick={handleCreate}>
                  创建
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )}

        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ y: 400 }}
        />
      </Modal>

      {/* 修改用户弹窗 */}
      <Modal
        title="修改用户信息"
        open={editModalVisible}
        onCancel={() => { setEditModalVisible(false); setEditingUser(null); }}
        onOk={handleSaveEdit}
        confirmLoading={editSubmitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          {/* 用户名和角色只读展示 */}
          <Form.Item label="用户名">
            <Input value={editingUser?.username} disabled />
          </Form.Item>
          <Form.Item label="角色">
            <Input value={ROLE_MAP[editingUser?.role] || editingUser?.role} disabled />
          </Form.Item>

          {/* 显示名称（所有角色可编辑） */}
          <Form.Item
            name="display_name"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="显示名称" />
          </Form.Item>

          {/* 单位名称（仅 UNIT 角色显示） */}
          {editingUser?.role === 'UNIT' && (
            <Form.Item
              name="unit_name"
              label="单位名称"
              rules={[{ required: true, message: '请输入单位名称' }]}
            >
              <Input placeholder="单位名称" />
            </Form.Item>
          )}

          {/* 银行名称（仅 BANK 角色显示） */}
          {editingUser?.role === 'BANK' && (
            <Form.Item
              name="bank_name"
              label="银行名称"
              rules={[{ required: true, message: '请输入银行名称' }]}
            >
              <Input placeholder="银行名称" />
            </Form.Item>
          )}

          {/* FINANCE 角色只显示提示 */}
          {editingUser?.role === 'FINANCE' && (
            <p style={{ color: '#888' }}>财政用户仅可修改显示名称</p>
          )}
        </Form>
      </Modal>
    </>
  );
}
