/**
 * 银行端首页：Tabs（待审核 + 已发放）+ 受控分页
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tabs, Card, Typography, Button, message } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { appAPI } from '../../api';
import StatusTag from '../../components/StatusTag';
import AuditModal from './AuditModal';
import ResizableTable from '../../components/ResizableTable';

const { Title } = Typography;

export default function BankDashboard() {
  // Tab 状态
  const [activeTab, setActiveTab] = useState('PENDING');

  // 待审核数据
  const [pendingData, setPendingData] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // 已发放数据
  const [issuedData, setIssuedData] = useState([]);
  const [issuedLoading, setIssuedLoading] = useState(false);

  // 审核弹窗
  const [auditVisible, setAuditVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);

  // ==================== 受控分页 state（每个 Tab 独立） ====================
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(20);
  const [issuedPage, setIssuedPage] = useState(1);
  const [issuedPageSize, setIssuedPageSize] = useState(20);

  // 防止竞态：每次新请求取消上一次
  const abortRef = useRef(null);

  /** 获取数据 */
  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (activeTab === 'PENDING') {
      setPendingLoading(true);
      try {
        const res = await appAPI.list({ status: 'PENDING' }, controller.signal);
        setPendingData(res.data.data);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        message.error('获取待审核列表失败');
      } finally {
        setPendingLoading(false);
      }
    } else {
      setIssuedLoading(true);
      try {
        const res = await appAPI.list({ status: 'ISSUED' }, controller.signal);
        setIssuedData(res.data.data);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        message.error('获取已发放列表失败');
      } finally {
        setIssuedLoading(false);
      }
    }
  }, [activeTab]);

  // 初始加载 + Tab 切换
  useEffect(() => { fetchData(); }, [fetchData]);

  // 5 秒轮询
  useEffect(() => {
    const interval = setInterval(fetchData, 5000);
    return () => {
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  // 数据变化时检查越界
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(pendingData.length / pendingPageSize));
    if (pendingPage > maxPage) setPendingPage(maxPage);
  }, [pendingData.length, pendingPageSize]);
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(issuedData.length / issuedPageSize));
    if (issuedPage > maxPage) setIssuedPage(maxPage);
  }, [issuedData.length, issuedPageSize]);
  /** 打开审核弹窗 */
  const openAudit = (record) => {
    setCurrentRecord(record);
    setAuditVisible(true);
  };

  /** 审核成功回调 */
  const onAuditSuccess = () => {
    fetchData();
  };

  // ==================== 分页配置（受控模式）====================
  const pendingPagination = useMemo(() => ({
    current: pendingPage,
    pageSize: pendingPageSize,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: t => `共 ${t} 条`,
    total: pendingData.length,
  }), [pendingPage, pendingPageSize, pendingData.length]);

  const issuedPagination = useMemo(() => ({
    current: issuedPage,
    pageSize: issuedPageSize,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: t => `共 ${t} 条`,
    total: issuedData.length,
  }), [issuedPage, issuedPageSize, issuedData.length]);

  const handlePendingChange = useCallback((pag) => {
    if (pag.current) setPendingPage(pag.current);
    if (pag.pageSize && pag.pageSize !== pendingPageSize) {
      setPendingPageSize(pag.pageSize);
      setPendingPage(1);
    }
  }, [pendingPageSize]);

  const handleIssuedChange = useCallback((pag) => {
    if (pag.current) setIssuedPage(pag.current);
    if (pag.pageSize && pag.pageSize !== issuedPageSize) {
      setIssuedPageSize(pag.pageSize);
      setIssuedPage(1);
    }
  }, [issuedPageSize]);

  // ==================== 表格列定义 ====================
  const pendingColumns = useMemo(() => [
    { title: '申请单号', dataIndex: 'application_no', width: 170 },
    { title: '项目名称', dataIndex: 'project_name', ellipsis: true },
    { title: '发放单号', dataIndex: 'issue_no', width: 130 },
    { title: '银行名称', dataIndex: 'bank_name', width: 140 },
    { title: '申请日期', dataIndex: 'application_date', width: 180 },
    { title: '单位名称', dataIndex: 'unit_name', width: 120 },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<CheckCircleOutlined />}
          onClick={() => openAudit(record)}
        >
          审核
        </Button>
      ),
    },
  ], []);

  const issuedColumns = useMemo(() => [
    { title: '申请单号', dataIndex: 'application_no', width: 170 },
    { title: '项目名称', dataIndex: 'project_name', ellipsis: true },
    { title: '发放单号', dataIndex: 'issue_no', width: 130 },
    { title: '银行名称', dataIndex: 'bank_name', width: 140 },
    { title: '申请日期', dataIndex: 'application_date', width: 180 },
    { title: '单位名称', dataIndex: 'unit_name', width: 120 },
    { title: '审核时间', dataIndex: 'audit_date', width: 180 },
    {
      title: '审核备注', dataIndex: 'audit_remark', width: 150,
      render: v => v || '-',
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: s => <StatusTag status={s} />,
    },
  ], []);

  const tabItems = useMemo(() => [
    {
      key: 'PENDING',
      label: `待审核（${pendingData.length}）`,
      children: (
        <ResizableTable
          rowKey="id"
          columns={pendingColumns}
          dataSource={pendingData}
          loading={pendingLoading}
          pagination={pendingPagination}
          onChange={handlePendingChange}
          scroll={{ x: 1100 }}
        />
      ),
    },
    {
      key: 'ISSUED',
      label: `已发放（${issuedData.length}）`,
      children: (
        <ResizableTable
          rowKey="id"
          columns={issuedColumns}
          dataSource={issuedData}
          loading={issuedLoading}
          pagination={issuedPagination}
          onChange={handleIssuedChange}
          scroll={{ x: 1200 }}
        />
      ),
    },
  ], [pendingData, pendingLoading, issuedData, issuedLoading, pendingColumns, issuedColumns,
    pendingPagination, issuedPagination, handlePendingChange, handleIssuedChange]);

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>审核管理</Title>
      </Card>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <AuditModal
        visible={auditVisible}
        record={currentRecord}
        onCancel={() => setAuditVisible(false)}
        onSuccess={onAuditSuccess}
      />
    </div>
  );
}
