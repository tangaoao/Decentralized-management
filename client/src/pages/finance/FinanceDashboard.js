/**
 * 财政端首页：汇总报表 + 全量申请列表 + 用户管理 + 受控分页
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Select, Input, Space, Card, Typography, message, Button } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { appAPI } from '../../api';
import StatusTag from '../../components/StatusTag';
import SummaryReport from './SummaryReport';
import UserManageModal from './UserManageModal';
import ResizableTable from '../../components/ResizableTable';

const { Title } = Typography;

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待银行审核' },
  { value: 'ISSUED', label: '已发放' },
  { value: 'RETURNED', label: '已退回' },
];

export default function FinanceDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // 筛选条件
  const [filterUnit, setFilterUnit] = useState('');
  const [filterIssueNo, setFilterIssueNo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // 用户管理弹窗
  const [userModalOpen, setUserModalOpen] = useState(false);

  // ==================== 受控分页 state ====================
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 防止竞态：每次新请求取消上一次
  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await appAPI.list(null, controller.signal);
      let rows = res.data.data || [];

      // 前端筛选
      if (filterUnit) {
        rows = rows.filter(r => r.unit_name && r.unit_name.includes(filterUnit));
      }
      if (filterIssueNo) {
        rows = rows.filter(r => r.issue_no && r.issue_no.includes(filterIssueNo));
      }
      if (filterStatus) {
        rows = rows.filter(r => r.status === filterStatus);
      }
      setData(rows);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [filterUnit, filterIssueNo, filterStatus]);

  // 筛选条件变化 → 重置到第 1 页
  useEffect(() => { setPage(1); }, [filterUnit, filterIssueNo, filterStatus]);

  // 数据变化时检查当前页是否越界
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(data.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [data.length, pageSize]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // 5 秒轮询
  useEffect(() => {
    const interval = setInterval(fetchData, 5000);
    return () => {
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  // ==================== 分页配置（受控模式）====================
  const paginationConfig = useMemo(() => ({
    current: page,
    pageSize,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: t => `共 ${t} 条`,
    total: data.length,
  }), [page, pageSize, data.length]);

  const handleTableChange = useCallback((pag) => {
    if (pag.current) setPage(pag.current);
    if (pag.pageSize && pag.pageSize !== pageSize) {
      setPageSize(pag.pageSize);
      setPage(1);
    }
  }, [pageSize]);

  const columns = useMemo(() => [
    { title: '申请单号', dataIndex: 'application_no', width: 170 },
    { title: '项目名称', dataIndex: 'project_name', ellipsis: true },
    { title: '发放单号', dataIndex: 'issue_no', width: 170 },
    { title: '银行名称', dataIndex: 'bank_name', width: 140 },
    { title: '申请日期', dataIndex: 'application_date', width: 180 },
    { title: '单位名称', dataIndex: 'unit_name', width: 120 },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: s => <StatusTag status={s} />,
    },
  ], []);

  return (
    <div>
      {/* 汇总报表 */}
      <Card style={{ marginBottom: 24 }}>
        <SummaryReport />
      </Card>

      {/* 全量申请列表 */}
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0 }}>全量申请列表</Title>
          <Space wrap>
            <Input
              placeholder="按单位名称筛选"
              value={filterUnit}
              onChange={e => setFilterUnit(e.target.value)}
              style={{ width: 160 }}
              allowClear
            />
            <Input
              placeholder="按发放单号筛选"
              value={filterIssueNo}
              onChange={e => setFilterIssueNo(e.target.value)}
              style={{ width: 160 }}
              allowClear
            />
            <Select
              placeholder="按状态筛选"
              value={filterStatus}
              onChange={setFilterStatus}
              options={STATUS_OPTIONS}
              style={{ width: 140 }}
              allowClear
            />
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => setUserModalOpen(true)}
            >
              用户管理
            </Button>
          </Space>
        </Space>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={paginationConfig}
          onChange={handleTableChange}
          scroll={{ x: 1100 }}
        />
      </Card>

      {/* 用户管理弹窗 */}
      <UserManageModal
        visible={userModalOpen}
        onCancel={() => setUserModalOpen(false)}
      />
    </div>
  );
}
