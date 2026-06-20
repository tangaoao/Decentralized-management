/**
 * 财政端部门管理页：左侧树状组织架构 + 右侧部门用户列表
 * 支持增删改、拖拽排序、查看部门下用户、禁用/启用账号
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Tree, Typography, Button, Space, message, Popconfirm, Input, Modal,
  Table, Switch, Tag, Empty, Spin, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  TeamOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import { departmentAPI, userAPI } from '../../api';

const { Title, Text } = Typography;

const CATEGORY_LABELS = {
  budget_unit: '预算单位',
  finance_system: '财政系统',
  bank_system: '银行系统',
};

const CATEGORY_COLORS = {
  budget_unit: 'blue',
  finance_system: 'green',
  bank_system: 'orange',
};

const ROLE_MAP = { UNIT: '单位用户', BANK: '银行用户', FINANCE: '财政用户' };

const DEPT_USER_PAGINATION = { pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: t => `共 ${t} 人` };

export default function DepartmentManagementPage() {
  // ========== 状态 ==========
  const [treeData, setTreeData] = useState([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState(null);
  const [deptUsers, setDeptUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);

  // 新增/编辑弹窗
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [modalParentId, setModalParentId] = useState(null);
  const [modalCategory, setModalCategory] = useState('');
  const [modalDeptId, setModalDeptId] = useState(null);
  const [modalName, setModalName] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // ========== 加载部门树 ==========
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await departmentAPI.tree();
      const raw = res.data.data || [];
      const formatted = formatTreeData(raw);
      setTreeData(formatted);
    } catch (err) {
      message.error('获取部门树失败');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  // ========== 加载部门用户 ==========
  const loadDeptUsers = useCallback(async (deptId, recursive = false) => {
    setUsersLoading(true);
    try {
      const params = recursive ? { recursive: true } : undefined;
      const res = await departmentAPI.users(deptId, params);
      setDeptUsers(res.data.data || []);
    } catch (err) {
      console.error('获取部门用户失败:', err);
      message.error('获取部门用户失败');
      setDeptUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ========== 格式化树数据 ==========
  const formatTreeData = (nodes) => {
    return nodes.map(node => ({
      key: node.id,
      title: (
        <span>
          <Tag color={CATEGORY_COLORS[node.category]} style={{ marginRight: 4, fontSize: 10, lineHeight: '16px' }}>
            {CATEGORY_LABELS[node.category]?.charAt(0) || '?'}
          </Tag>
          {node.name}
        </span>
      ),
      // 存储原始数据
      data: node,
      children: node.children && node.children.length > 0
        ? formatTreeData(node.children)
        : undefined,
    }));
  };

  // ========== 选择部门 ==========
  const handleSelect = (selectedKeys, info) => {
    if (selectedKeys.length === 0) return;
    const nodeData = info.node.data;
    const isRoot = nodeData.parent_id === null;
    setSelectedDept(nodeData);
    loadDeptUsers(nodeData.id, isRoot);
  };

  // ========== 新增子部门 ==========
  const handleAddChild = (parentNode) => {
    setModalMode('add');
    setModalParentId(parentNode.data.id);
    setModalCategory(parentNode.data.category);
    setModalDeptId(null);
    setModalName('');
    setModalVisible(true);
  };

  // ========== 新增顶级部门（在某个 category 下） ==========
  const handleAddRoot = (category) => {
    setModalMode('add');
    setModalParentId(null);
    setModalCategory(category);
    setModalDeptId(null);
    setModalName('');
    setModalVisible(true);
  };

  // ========== 编辑部门 ==========
  const handleEdit = (nodeData) => {
    setModalMode('edit');
    setModalDeptId(nodeData.id);
    setModalName(nodeData.name);
    setModalCategory(nodeData.category);
    setModalParentId(null);
    setModalVisible(true);
  };

  // ========== 提交表单 ==========
  const handleModalOk = async () => {
    if (!modalName.trim()) {
      message.warning('请输入部门名称');
      return;
    }
    setModalSubmitting(true);
    try {
      if (modalMode === 'add') {
        await departmentAPI.create({
          name: modalName.trim(),
          parent_id: modalParentId,
          category: modalCategory,
        });
        message.success('部门已创建');
      } else {
        await departmentAPI.update(modalDeptId, { name: modalName.trim() });
        message.success('部门已更新');
      }
      setModalVisible(false);
      loadTree();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    } finally {
      setModalSubmitting(false);
    }
  };

  // ========== 删除部门 ==========
  const handleDelete = async (nodeData) => {
    try {
      await departmentAPI.delete(nodeData.id);
      message.success('部门已删除');
      if (selectedDept?.id === nodeData.id) {
        setSelectedDept(null);
        setDeptUsers([]);
      }
      loadTree();
    } catch (err) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  // ========== 拖拽排序 ==========
  const handleDrop = async (info) => {
    const { dragNode, node, dropPosition, dropToGap } = info;

    const dragData = dragNode.data;
    const targetData = node.data;

    // 确定目标父节点
    let newParentId;
    if (!dropToGap) {
      // 放到节点内部（成为子节点）
      newParentId = targetData.id;
    } else {
      // 放到节点上方/下方（成为同级）
      newParentId = targetData.parent_id;
    }

    // 不允许跨分类移动
    if (newParentId) {
      // 目标不是顶级节点时，需要找到目标父节点的 category
      const findNodeCategory = (tree, id) => {
        for (const n of tree) {
          if (n.data.id === id) return n.data.category;
          const found = findNodeCategory(n.children || [], id);
          if (found) return found;
        }
        return null;
      };
      const targetCategory = findNodeCategory(treeData, newParentId);
      if (targetCategory && targetCategory !== dragData.category) {
        message.warning('不能跨分类移动部门');
        return;
      }
    }

    try {
      // 计算新的 sort_order
      const siblings = dropToGap
        ? node.children || []  // 需要找原始数据中的兄弟节点
        : []; // 放到节点内部作为第一个子节点

      await departmentAPI.move(dragData.id, {
        parent_id: newParentId,
        sort_order: dropPosition,
      });
      message.success('部门已移动');
      loadTree();
    } catch (err) {
      message.error(err.response?.data?.error || '移动失败');
    }
  };

  // ========== 切换用户启用/禁用 ==========
  const handleToggleUserActive = async (record) => {
    try {
      await userAPI.toggleActive(record.id);
      message.success(record.is_active ? '账号已禁用' : '账号已启用');
      loadDeptUsers(selectedDept.id, selectedDept.parent_id === null);
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  // ========== 渲染树节点标题（附加操作按钮）==========
  const renderTreeNodeTitle = (nodeData) => {
    const isRoot = nodeData.parent_id === null;
    return (
      <Space size={4} style={{ lineHeight: '24px' }}>
        <Tag color={CATEGORY_COLORS[nodeData.category]}>
          {CATEGORY_LABELS[nodeData.category]}
        </Tag>
        <span>{nodeData.name}</span>
        <Tooltip title="新增子部门">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={e => { e.stopPropagation(); handleAddChild({ data: nodeData }); }}
          />
        </Tooltip>
        <Tooltip title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={e => { e.stopPropagation(); handleEdit(nodeData); }}
          />
        </Tooltip>
        {!isRoot && (
          <Popconfirm
            title="确定删除该部门？"
            description="仅可删除无子部门的节点"
            onConfirm={(e) => { e?.stopPropagation(); handleDelete(nodeData); }}
            onCancel={e => e?.stopPropagation()}
            okText="删除"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={e => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        )}
      </Space>
    );
  };

  // ========== 重新格式化树数据（加操作按钮）==========
  const treeDataWithActions = React.useMemo(() => {
    const addActions = (nodes) => {
      return nodes.map(node => ({
        key: node.key,
        title: renderTreeNodeTitle(node.data),
        data: node.data,
        children: node.children && node.children.length > 0
          ? addActions(node.children)
          : undefined,
      }));
    };
    return addActions(treeData);
  }, [treeData]);

  // ========== 用户列表列定义 ==========
  const userColumns = [
    { title: '用户名', dataIndex: 'username', width: 100 },
    { title: '角色', dataIndex: 'role', width: 90, render: r => ROLE_MAP[r] || r },
    { title: '显示名称', dataIndex: 'display_name', width: 120 },
    { title: '关联名称', width: 140, render: (_, r) => {
      if (r.role === 'UNIT') return r.unit_name || '-';
      if (r.role === 'BANK') return r.bank_name || '-';
      return '-';
    }},
    {
      title: '状态', dataIndex: 'is_active', width: 80,
      render: (v, record) => (
        <Switch
          size="small"
          checked={v !== 0}
          onChange={() => handleToggleUserActive(record)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
  ];

  return (
    <div style={{ margin: '-10px -10px -10px -10px', padding: '0 10px 0 0', height: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', gap: 16, height: '100%' }}>
        {/* ===== 左侧：部门树 ===== */}
        <Card
          title={
            <Space>
              <ApartmentOutlined />
              <span>组织架构</span>
            </Space>
          }
          extra={
            <Space size={4}>
              <Tooltip title="新增预算单位子部门">
                <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddRoot('budget_unit')}>
                  预算
                </Button>
              </Tooltip>
              <Tooltip title="新增财政系统子部门">
                <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddRoot('finance_system')}>
                  财政
                </Button>
              </Tooltip>
              <Tooltip title="新增银行系统子部门">
                <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddRoot('bank_system')}>
                  银行
                </Button>
              </Tooltip>
            </Space>
          }
          style={{ width: 400, flexShrink: 0 }}
          bodyStyle={{ padding: 8, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}
      >
        {treeLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : treeData.length === 0 ? (
          <Empty description="暂无部门数据" />
        ) : (
          <Tree
            treeData={treeDataWithActions}
            expandedKeys={expandedKeys}
            onExpand={setExpandedKeys}
            onSelect={handleSelect}
            draggable={{ icon: false }}
            onDrop={handleDrop}
            blockNode
            showLine={{ showLeafIcon: false }}
            style={{ fontSize: 14 }}
          />
        )}
      </Card>

      {/* ===== 右侧：部门用户列表 ===== */}
      <Card
        title={
          selectedDept ? (
            <Space>
              <TeamOutlined />
              <span>{selectedDept.name}</span>
              <Tag color={CATEGORY_COLORS[selectedDept.category]}>
                {CATEGORY_LABELS[selectedDept.category]}
              </Tag>
              <Text type="secondary">
                — {selectedDept.parent_id === null ? '所有下级部门用户' : '部门用户'}
              </Text>
            </Space>
          ) : (
            <Space>
              <TeamOutlined />
              <span>部门用户</span>
              <Text type="secondary">— 请从左侧选择一个部门</Text>
            </Space>
          )
        }
        style={{ flex: 1 }}
      >
        {!selectedDept ? (
          <Empty description="点击左侧部门查看关联用户" style={{ padding: 60 }} />
        ) : (
          <Table
            rowKey="id"
            columns={userColumns}
            dataSource={deptUsers}
            loading={usersLoading}
            pagination={DEPT_USER_PAGINATION}
            size="small"
            locale={{ emptyText: '该部门下暂无关联用户' }}
          />
        )}
      </Card>

      {/* ===== 新增/编辑部门弹窗 ===== */}
      <Modal
        title={modalMode === 'add' ? '新增部门' : '编辑部门'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        confirmLoading={modalSubmitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">分类：</Text>
            <Tag color={CATEGORY_COLORS[modalCategory]} style={{ marginLeft: 8 }}>
              {CATEGORY_LABELS[modalCategory]}
            </Tag>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary">部门名称：</Text>
          </div>
          <Input
            placeholder="请输入部门名称"
            value={modalName}
            onChange={e => setModalName(e.target.value)}
            onPressEnter={handleModalOk}
            autoFocus
          />
        </div>
      </Modal>
      </div>
    </div>
  );
}
