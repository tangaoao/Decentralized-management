/**
 * 单位端首页：批量新增申请 + 我的申请列表（批次分组） + 受控分页
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Modal, Form, Input, Select, Space, Row, Col,
  Typography, message, Card, Tag, Statistic,
} from 'antd';
import { PlusOutlined, EditOutlined, MinusCircleOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { useAuth } from '../../auth/AuthContext';
import { appAPI, userAPI } from '../../api';
import StatusTag, { STATUS_MAP } from '../../components/StatusTag';
import ResizableTable from '../../components/ResizableTable';

const { Title, Text } = Typography;
const { TextArea } = Input;

/** 发放单号格式校验：2026-411381 固定前缀 + 项目缩写 + 序号 */
const ISSUE_NO_PATTERN = /^202\d-411381-[A-Z]{2,10}-\d{6,10}$/;

export default function UnitDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // 列表状态
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  // 银行列表（下拉选项）
  const [banks, setBanks] = useState([]);

  // 新增弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // ==================== 受控分页 state ====================
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 批次折叠状态：记录已折叠的批次 key（默认全部展开）
  const [collapsedBatchKeys, setCollapsedBatchKeys] = useState(new Set());

  // 防止竞态：每次新请求取消上一次
  const abortRef = useRef(null);

  /** 获取数据（始终拉取全量，客户端做筛选和计数） */
  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await appAPI.list({}, controller.signal);
      setData(res.data.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      message.error('获取申请列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 筛选变化 → 重置到第 1 页
  useEffect(() => { setPage(1); }, [statusFilter]);

  /** 客户端状态筛选 */
  const filteredData = useMemo(() => {
    if (!statusFilter) return data;
    return data.filter(item => item.status === statusFilter);
  }, [data, statusFilter]);

  /** 各状态计数（基于全量数据） */
  const statusCounts = useMemo(() => {
    const counts = { total: data.length, PENDING: 0, ISSUED: 0, RETURNED: 0 };
    data.forEach(item => {
      if (counts[item.status] !== undefined) counts[item.status]++;
    });
    return counts;
  }, [data]);

  /** 点击状态卡片切换筛选 */
  const handleStatusClick = useCallback((status) => {
    if (statusFilter === status) {
      setStatusFilter(''); // 再次点击已选中 → 回到"全部"
    } else {
      setStatusFilter(status);
    }
  }, [statusFilter]);

  // ==================== 批次分组数据转换 ====================
  const groupedData = useMemo(() => {
    const batchMap = {};
    const singles = [];

    for (const item of filteredData) {
      if (item.batch_id) {
        if (!batchMap[item.batch_id]) batchMap[item.batch_id] = [];
        batchMap[item.batch_id].push(item);
      } else {
        singles.push(item);
      }
    }

    const result = [];
    for (const [batchId, items] of Object.entries(batchMap)) {
      if (items.length >= 2) {
        const first = items[0];
        result.push({
          key: `batch-${batchId}`,
          id: `batch-${batchId}`,
          application_no: '',
          project_name: '',
          issue_no: '',
          bank_name: first.bank_name || '',
          application_date: first.application_date || '',
          status: '',
          isBatchHeader: true,
          batch_id: batchId,
          batchCount: items.length,
          children: items.map(it => ({ ...it, key: it.id })),
        });
      } else {
        result.push(...items.map(it => ({ ...it, key: it.id })));
      }
    }
    result.push(...singles.map(it => ({ ...it, key: it.id })));

    result.sort((a, b) => {
      const aid = a.isBatchHeader ? (a.children?.[0]?.id || 0) : (a.id || 0);
      const bid = b.isBatchHeader ? (b.children?.[0]?.id || 0) : (b.id || 0);
      return bid - aid;
    });

    // 为同一天的批次分配序号（按 id 降序后，先出现的批次序号更大）
    const dateSeqMap = {};
    for (const item of result) {
      if (item.isBatchHeader) {
        const date = item.application_date?.slice(0, 10) || '';
        dateSeqMap[date] = (dateSeqMap[date] || 0) + 1;
        item.batchSeq = dateSeqMap[date];
      }
    }

    return result;
  }, [filteredData]);

  // 数据变化时检查越界
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(groupedData.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [groupedData.length, pageSize]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // 5 秒轮询
  useEffect(() => {
    const interval = setInterval(fetchData, 5000);
    return () => {
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  /** 计算当前表单总单号数 */
  const countTotalIssues = () => {
    const projects = form.getFieldValue('projects') || [];
    if (!Array.isArray(projects)) return 0;
    let count = 0;
    for (const p of projects) {
      if (p && Array.isArray(p.issue_nos)) {
        count += p.issue_nos.filter(n => n && n.trim()).length;
      }
    }
    return count;
  };

  /** 强制刷新提交按钮文本 */
  const [, setTick] = useState(0);

  /** 提交新申请（批量） */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // 组装批量 payload
      const payload = {
        assigned_bank: values.assigned_bank,
        unit_name: user?.unit_name || values.unit_name,
        projects: values.projects.map(p => ({
          project_name: p.project_name,
          issue_nos: (p.issue_nos || []).filter(n => n && n.trim()),
          reason: p.reason || '',
        })),
      };

      const res = await appAPI.create(payload);
      const result = res.data;
      // 批量返回 { count, batch_id, applications }；单条返回记录本身
      const count = result.count || 1;
      message.success(`申请提交成功，共创建 ${count} 条记录`);
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err) {
      if (err.response) {
        message.error(err.response.data?.error || '提交失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** 打开新增弹窗 */
  const openModal = async () => {
    form.resetFields();
    // 初始化：1 个项目 + 1 个单号（和旧版体验一致）
    form.setFieldsValue({
      unit_name: user?.unit_name || '',
      projects: [{ project_name: '', issue_nos: [''], reason: '' }],
    });
    setTick(0);
    try {
      const res = await userAPI.listBanks();
      setBanks(res.data.data || []);
    } catch (err) {
      message.error('获取银行列表失败');
    }
    setModalOpen(true);
  };

  // 计算当前应展开的批次 keys
  const expandedRowKeys = useMemo(() => {
    const keys = [];
    for (const item of groupedData) {
      if (item.isBatchHeader && !collapsedBatchKeys.has(item.key)) {
        keys.push(item.key);
      }
    }
    return keys;
  }, [groupedData, collapsedBatchKeys]);

  // ==================== 分页配置（受控模式）====================
  const paginationConfig = useMemo(() => ({
    current: page,
    pageSize,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: t => `共 ${t} 条`,
    total: groupedData.length,
  }), [page, pageSize, groupedData.length]);

  const handleTableChange = useCallback((pag) => {
    if (pag.current) setPage(pag.current);
    if (pag.pageSize && pag.pageSize !== pageSize) {
      setPageSize(pag.pageSize);
      setPage(1);
    }
  }, [pageSize]);

  // ==================== 表格列定义 ====================
  const columns = useMemo(() => [
    {
      title: '申请单号',
      dataIndex: 'application_no',
      width: 170,
      render: (text, record) => {
        if (record.isBatchHeader) {
          const date = record.application_date?.slice(0, 10) || '';
          return (
            <span style={{ fontWeight: 500 }}>
              批次 · {date} #{record.batchSeq}
            </span>
          );
        }
        return text;
      },
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      ellipsis: true,
      render: (text, record) => {
        if (record.isBatchHeader) {
          return (
            <Tag color="blue" style={{ fontWeight: 400 }}>
              共 {record.batchCount} 条记录
            </Tag>
          );
        }
        return text;
      },
    },
    {
      title: '发放单号',
      dataIndex: 'issue_no',
      width: 170,
      render: (text, record) => {
        if (record.isBatchHeader) return record.bank_name;
        return text;
      },
    },
    { title: '银行名称', dataIndex: 'bank_name', width: 140, render: (text, record) => record.isBatchHeader ? null : text },
    { title: '申请日期', dataIndex: 'application_date', width: 180, render: (text, record) => record.isBatchHeader ? null : text },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s, record) => record.isBatchHeader ? null : <StatusTag status={s} />,
    },
    {
      title: '操作', width: 120,
      render: (_, record) => {
        if (record.isBatchHeader) return null;
        if (record.status === 'RETURNED') {
          return (
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => navigate(`/unit/edit/${record.id}`)}
            >
              修改重提
            </Button>
          );
        }
        return null;
      },
    },
  ], [navigate]);

  return (
    <div>
      {/* 顶部操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title level={5} style={{ margin: 0 }}>我的申请</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>
            新增申请
          </Button>
        </Space>
      </Card>

      {/* 状态汇总卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { key: '', label: '全部', color: '#1890ff', count: statusCounts.total },
          { key: 'PENDING', label: STATUS_MAP.PENDING.text, color: STATUS_MAP.PENDING.color === 'orange' ? '#faad14' : STATUS_MAP.PENDING.color, count: statusCounts.PENDING },
          { key: 'ISSUED', label: STATUS_MAP.ISSUED.text, color: STATUS_MAP.ISSUED.color === 'green' ? '#52c41a' : STATUS_MAP.ISSUED.color, count: statusCounts.ISSUED },
          { key: 'RETURNED', label: STATUS_MAP.RETURNED.text, color: STATUS_MAP.RETURNED.color === 'red' ? '#ff4d4f' : STATUS_MAP.RETURNED.color, count: statusCounts.RETURNED },
        ].map(item => {
          const isActive = statusFilter === item.key;
          return (
            <Col xs={12} sm={6} key={item.key || '__all__'}>
              <Card
                hoverable
                size="small"
                onClick={() => handleStatusClick(item.key)}
                style={{
                  borderTop: `3px solid ${item.color}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  ...(isActive ? {
                    borderColor: item.color,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    boxShadow: `0 0 0 2px ${item.color}33`,
                    background: `${item.color}0f`,
                  } : {}),
                }}
              >
                <Statistic
                  title={item.label}
                  value={item.count}
                  valueStyle={{ color: item.color, fontSize: 24, fontWeight: 600 }}
                />
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 申请列表（含批次分组） */}
      <ResizableTable
        rowKey="key"
        columns={columns}
        dataSource={groupedData}
        loading={loading}
        pagination={paginationConfig}
        onChange={handleTableChange}
        scroll={{ x: 1000 }}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: (keys) => {
            // 找出被折叠的批次（之前展开但现在不在 keys 中的）
            const newCollapsed = new Set(collapsedBatchKeys);
            for (const item of groupedData) {
              if (item.isBatchHeader) {
                if (keys.includes(item.key)) {
                  newCollapsed.delete(item.key);
                } else {
                  newCollapsed.add(item.key);
                }
              }
            }
            setCollapsedBatchKeys(newCollapsed);
          },
          rowExpandable: (record) => record.isBatchHeader,
          expandIcon: ({ expanded, onExpand, record }) => {
            if (!record.isBatchHeader) return null;
            return expanded
              ? <DownOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', color: '#1890ff' }} />
              : <RightOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', color: '#1890ff' }} />;
          },
        }}
        rowClassName={(record) => record.isBatchHeader ? 'batch-header-row' : ''}
      />

      {/* 新增申请弹窗 — 批量表单 */}
      <Modal
        title="新增二次发放申请"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={`提交 (共 ${countTotalIssues()} 条)`}
        cancelText="取消"
        width={720}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={() => setTick(t => t + 1)}
          initialValues={{
            projects: [{ project_name: '', issue_nos: [''], reason: '' }],
          }}
        >
          {/* 银行选择 — 所有项目共用 */}
          <Form.Item
            name="assigned_bank"
            label="分配银行（所有项目共用）"
            rules={[{ required: true, message: '请选择审核银行' }]}
          >
            <Select
              placeholder="请选择审核银行"
              options={banks.map(b => ({ value: b.username, label: b.bank_name }))}
              style={{ maxWidth: 300 }}
            />
          </Form.Item>

          {/* 单位名称 — 自动填充 */}
          <Form.Item
            name="unit_name"
            label="单位名称"
            rules={[{ required: true, message: '请输入单位名称' }]}
          >
            <Input placeholder="请输入单位名称" disabled />
          </Form.Item>

          {/* 项目列表 */}
          <Form.List name="projects">
            {(projectFields, { add: addProject, remove: removeProject }) => (
              <>
                {projectFields.map(({ key, name, ...restField }, projIndex) => (
                  <Card
                    key={key}
                    size="small"
                    title={<Text strong>项目 {projIndex + 1}</Text>}
                    extra={
                      projectFields.length > 1 ? (
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<MinusCircleOutlined />}
                          onClick={() => removeProject(name)}
                        >
                          删除项目
                        </Button>
                      ) : null
                    }
                    style={{ marginBottom: 12, borderColor: '#d9d9d9' }}
                  >
                    <Form.Item
                      {...restField}
                      name={[name, 'project_name']}
                      label="项目名称"
                      rules={[
                        { required: true, message: '请输入项目名称' },
                        { max: 100, message: '不能超过100个字符' },
                      ]}
                    >
                      <Input placeholder="请输入项目名称" />
                    </Form.Item>

                    {/* 项目内的发放单号列表 */}
                    <Form.Item label="发放单号" style={{ marginBottom: 0 }}>
                      <Form.List name={[name, 'issue_nos']}>
                        {(issueFields, { add: addIssue, remove: removeIssue }) => (
                          <div
                            style={{
                              background: '#fafafa',
                              borderRadius: 6,
                              padding: '12px 12px 4px',
                              border: '1px dashed #d9d9d9',
                            }}
                          >
                            {issueFields.map(({ key: ikey, name: iname, ...irest }) => (
                              <Space
                                key={ikey}
                                align="start"
                                style={{ display: 'flex', marginBottom: 8 }}
                              >
                                <Form.Item
                                  {...irest}
                                  name={[iname]}
                                  style={{ marginBottom: 0, flex: 1 }}
                                  rules={[
                                    { required: true, message: '请输入发放单号或删除此行' },
                                    { pattern: ISSUE_NO_PATTERN, message: '格式：202*-411381-****-********' },
                                  ]}
                                >
                                  <Input
                                    placeholder="202*-411381-****-********"
                                    style={{ width: 280 }}
                                  />
                                </Form.Item>
                                {issueFields.length > 1 && (
                                  <Button
                                    type="text"
                                    shape="circle"
                                    size="small"
                                    icon={<MinusCircleOutlined />}
                                    onClick={() => removeIssue(iname)}
                                    style={{ color: '#ff4d4f', marginTop: 4 }}
                                  />
                                )}
                              </Space>
                            ))}
                            <Button
                              type="dashed"
                              size="small"
                              onClick={() => addIssue('')}
                              icon={<PlusOutlined />}
                              style={{ marginBottom: 8 }}
                            >
                              添加单号
                            </Button>
                          </div>
                        )}
                      </Form.List>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'reason']}
                      label="申请理由"
                      rules={[{ max: 500, message: '不能超过500个字符' }]}
                      style={{ marginTop: 12 }}
                    >
                      <TextArea rows={2} placeholder="请输入申请理由（选填）" />
                    </Form.Item>
                  </Card>
                ))}

                <Button
                  type="dashed"
                  onClick={() => addProject({ project_name: '', issue_nos: [''], reason: '' })}
                  icon={<PlusOutlined />}
                  block
                >
                  添加项目
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
