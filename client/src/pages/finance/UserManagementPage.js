/**
 * 财政端用户管理页：查看/新增/修改/重置密码/删除/禁用用户
 * 从原 UserManageModal 改造为独立页面
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Form, Input, Select, Space, message, Popconfirm, Typography, Card, Switch, TreeSelect } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, LockOutlined } from '@ant-design/icons';
import { userAPI, departmentAPI } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import ResizableTable from '../../components/ResizableTable';

const { Title } = Typography;

const ROLE_OPTIONS = [
  { value: 'UNIT', label: '单位用户' },
  { value: 'BANK', label: '银行用户' },
  { value: 'FINANCE', label: '财政用户' },
];

const ROLE_MAP = { UNIT: '单位用户', BANK: '银行用户', FINANCE: '财政用户' };

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // ==================== 受控分页 state ====================
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form] = Form.useForm();
  const [selectedRole, setSelectedRole] = useState(null);

  // 修改弹窗状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm();

  // 部门树数据（用于 TreeSelect）
  const [deptTree, setDeptTree] = useState([]);

  // 将部门树转换为 TreeSelect 格式
  const convertToTreeSelectData = useCallback((nodes) => {
    return nodes.map(node => ({
      value: node.id,
      title: node.name,
      children: node.children && node.children.length > 0
        ? convertToTreeSelectData(node.children)
        : undefined,
    }));
  }, []);

  // 加载部门树
  useEffect(() => {
    departmentAPI.tree()
      .then(res => setDeptTree(convertToTreeSelectData(res.data.data || [])))
      .catch(() => message.error('获取部门树失败'));
  }, [convertToTreeSelectData]);

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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // 数据变化时检查当前页是否越界
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(users.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [users.length, pageSize]);
  // ==================== 分页配置（受控模式）====================
  const paginationConfig = useMemo(() => ({
    current: page,
    pageSize,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: t => `共 ${t} 人`,
    total: users.length,
  }), [page, pageSize, users.length]);

  const handleTableChange = useCallback((pag) => {
    if (pag.current) setPage(pag.current);
    if (pag.pageSize && pag.pageSize !== pageSize) {
      setPageSize(pag.pageSize);
      setPage(1);
    }
  }, [pageSize]);

  // 新增用户
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

  // 打开修改弹窗
  const handleOpenEdit = useCallback((record) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      display_name: record.display_name,
      unit_name: record.unit_name || '',
      bank_name: record.bank_name || '',
      department_id: record.department_id || undefined,
    });
    setEditModalVisible(true);
  }, [editForm]);

  // 保存修改
  const handleSaveEdit = useCallback(async () => {
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
  }, [editForm, editingUser, fetchUsers]);

  // 删除用户
  const handleDelete = useCallback(async (id) => {
    try {
      await userAPI.delete(id);
      message.success('用户已删除');
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || '删除失败');
    }
  }, [fetchUsers]);

  // 重置密码
  const handleResetPassword = useCallback(async (id) => {
    try {
      const res = await userAPI.resetPassword(id);
      message.success(`密码已重置为：${res.data.tempPassword}`);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || '重置密码失败');
    }
  }, [fetchUsers]);

  // 切换启用/禁用
  const handleToggleActive = useCallback(async (record) => {
    try {
      await userAPI.toggleActive(record.id);
      message.success(record.is_active ? '账号已禁用' : '账号已启用');
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  }, [fetchUsers]);

  const columns = useMemo(() => [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '用户名', dataIndex: 'username', width: 120 },
    { title: '角色', dataIndex: 'role', width: 100, render: r => ROLE_MAP[r] || r },
    { title: '显示名称', dataIndex: 'display_name', width: 130 },
    {
      title: '关联名称', width: 160,
      render: (_, r) => {
        if (r.role === 'UNIT') return r.unit_name || '-';
        if (r.role === 'BANK') return r.bank_name || '-';
        return '-';
      },
    },
    { title: '所属部门', dataIndex: 'department_name', width: 130, render: v => v || '-' },
    {
      title: '状态', dataIndex: 'is_active', width: 80,
      render: (v, record) => (
        <Switch
          checked={v !== 0}
          onChange={() => handleToggleActive(record)}
          disabled={record.id === currentUser?.id}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 170 },
    {
      title: '操作', width: 220,
      render: (_, record) => {
        const isSelf = record.id === currentUser?.id;
        return (
          <Space size={0}>
            <Button type="link" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>修改</Button>
            <Popconfirm
              title="重置密码"
              description="确定将该用户密码重置？"
              onConfirm={() => handleResetPassword(record.id)}
              okText="确定重置"
              cancelText="取消"
            >
              <Button type="link" icon={<LockOutlined />}>重置密码</Button>
            </Popconfirm>
            <Popconfirm
              title={isSelf ? '不能删除自己' : `确定删除用户「${record.username}」？`}
              onConfirm={() => !isSelf && handleDelete(record.id)}
              okText="确定删除"
              cancelText="取消"
            >
              <Button type="link" danger icon={<DeleteOutlined />} disabled={isSelf}>删除</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ], [currentUser, handleToggleActive, handleOpenEdit, handleResetPassword, handleDelete]);

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
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
          <Card style={{ marginTop: 16 }} size="small">
            <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }, { min: 2, max: 50, message: '2-50个字符' }]}>
                <Input placeholder="用户名" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 4, message: '至少4个字符' }]}>
                <Input.Password placeholder="密码" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name="role" rules={[{ required: true, message: '请选择角色' }]}>
                <Select placeholder="角色" options={ROLE_OPTIONS} style={{ width: 120 }} onChange={setSelectedRole} />
              </Form.Item>
              <Form.Item name="display_name" rules={[{ required: true, message: '请输入显示名称' }]}>
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
              <Form.Item name="department_id">
                <TreeSelect
                  placeholder="选择所属部门（可选）"
                  treeData={deptTree}
                  style={{ width: 220 }}
                  allowClear
                  treeDefaultExpandAll
                  dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                  filterTreeNode={(input, node) =>
                    node.title.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" loading={submitting} onClick={handleCreate}>创建</Button>
              </Form.Item>
            </Form>
          </Card>
        )}
      </Card>

      <Card>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={paginationConfig}
          onChange={handleTableChange}
          size="small"
          scroll={{ y: 'calc(100vh - 380px)' }}
        />
      </Card>

      {/* 修改用户弹窗（保留 Modal） */}
      {editModalVisible && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={() => { setEditModalVisible(false); setEditingUser(null); }}
        >
          <Card
            title="修改用户信息"
            style={{ width: 480 }}
            onClick={e => e.stopPropagation()}
            extra={
              <Button type="text" onClick={() => { setEditModalVisible(false); setEditingUser(null); }}>✕</Button>
            }
          >
            <Form form={editForm} layout="vertical">
              <Form.Item label="用户名">
                <Input value={editingUser?.username} disabled />
              </Form.Item>
              <Form.Item label="角色">
                <Input value={ROLE_MAP[editingUser?.role] || editingUser?.role} disabled />
              </Form.Item>
              <Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
                <Input placeholder="显示名称" />
              </Form.Item>
              {editingUser?.role === 'UNIT' && (
                <Form.Item name="unit_name" label="单位名称" rules={[{ required: true, message: '请输入单位名称' }]}>
                  <Input placeholder="单位名称" />
                </Form.Item>
              )}
              {editingUser?.role === 'BANK' && (
                <Form.Item name="bank_name" label="银行名称" rules={[{ required: true, message: '请输入银行名称' }]}>
                  <Input placeholder="银行名称" />
                </Form.Item>
              )}
              {editingUser?.role === 'FINANCE' && (
                <p style={{ color: '#888' }}>财政用户仅可修改显示名称</p>
              )}
              <Form.Item name="department_id" label="所属部门">
                <TreeSelect
                  placeholder="选择所属部门（可选）"
                  treeData={deptTree}
                  allowClear
                  treeDefaultExpandAll
                  dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                  filterTreeNode={(input, node) =>
                    node.title.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
              <div style={{ textAlign: 'right' }}>
                <Button onClick={() => { setEditModalVisible(false); setEditingUser(null); }} style={{ marginRight: 8 }}>取消</Button>
                <Button type="primary" loading={editSubmitting} onClick={handleSaveEdit}>保存</Button>
              </div>
            </Form>
          </Card>
        </div>
      )}
    </div>
  );
}
