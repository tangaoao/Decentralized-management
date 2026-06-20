/**
 * 财政端全量申请列表：支持筛选 + 5秒轮询 + 受控分页
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, Typography, Select, Input, Space, message, Button, Modal, Tooltip } from 'antd';
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { appAPI } from '../../api';
import StatusTag, { STATUS_MAP } from '../../components/StatusTag';
import ResizableTable from '../../components/ResizableTable';

const { Title } = Typography;

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待银行审核' },
  { value: 'ISSUED', label: '已发放' },
  { value: 'RETURNED', label: '已退回' },
];

/** 导出列定义：表头 → dataIndex */
const EXPORT_COLUMNS = [
  { header: '申请单号', dataIndex: 'application_no' },
  { header: '项目名称', dataIndex: 'project_name' },
  { header: '发放单号', dataIndex: 'issue_no' },
  { header: '银行名称', dataIndex: 'bank_name' },
  { header: '申请日期', dataIndex: 'application_date' },
  { header: '单位名称', dataIndex: 'unit_name' },
  { header: '状态',     dataIndex: 'status' },
];

/**
 * 将申请行数据导出为 Excel 文件
 * @param {Array} rows - 待导出的行数据
 * @param {string} filename - 下载文件名（不含扩展名）
 */
function exportToExcel(rows, filename = '全量申请列表') {
  const sheetData = rows.map(row => {
    const obj = {};
    EXPORT_COLUMNS.forEach(col => {
      const raw = row[col.dataIndex];
      obj[col.header] = col.dataIndex === 'status'
        ? (STATUS_MAP[raw]?.text || raw || '未知')
        : (raw ?? '');
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(sheetData);
  // 自动列宽
  ws['!cols'] = EXPORT_COLUMNS.map(col => ({
    wch: Math.min(40, Math.max(
      col.header.length,
      ...sheetData.map(r => String(r[col.header] || '').length)
    ) + 4),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '申请列表');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export default function AllApplicationsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filterUnit, setFilterUnit] = useState('');
  const [filterIssueNo, setFilterIssueNo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // 行选择
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

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

  // 筛选条件变化 → 重置到第 1 页 + 清空选择
  useEffect(() => { setPage(1); setSelectedRowKeys([]); }, [filterUnit, filterIssueNo, filterStatus]);

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

  // ==================== 分页配置（受控模式：显式传入 current + pageSize）====================
  const paginationConfig = useMemo(() => ({
    current: page,
    pageSize,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: t => `共 ${t} 条`,
    total: data.length,
  }), [page, pageSize, data.length]);

  // ==================== 分页变化回调 ====================
  const handleTableChange = useCallback((pag) => {
    if (pag.current) setPage(pag.current);
    if (pag.pageSize && pag.pageSize !== pageSize) {
      setPageSize(pag.pageSize);
      setPage(1); // pageSize 变化回到第 1 页
    }
  }, [pageSize]);

  // ==================== 批量删除 ====================
  const handleBatchDelete = useCallback(() => {
    if (selectedRowKeys.length === 0) return;

    // 从 data 中找到选中的完整行
    const selectedRows = data.filter(r => selectedRowKeys.includes(r.id));
    const nonIssued = selectedRows.filter(r => r.status !== 'ISSUED');

    // 存在非已发放状态的记录，禁止删除
    if (nonIssued.length > 0) {
      const appNos = nonIssued.map(r => r.application_no).join('、');
      message.warning(
        `选中的记录中包含非"已发放"状态的申请（${appNos}），请仅选择已发放状态的记录进行删除`
      );
      return;
    }

    // 全部为已发放，弹窗确认
    Modal.confirm({
      title: '确认删除',
      content: `已选择 ${selectedRowKeys.length} 条已发放申请记录，删除后所有用户将无法查看此数据，确定删除？`,
      okText: '确定删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await appAPI.deleteBatch(selectedRowKeys);
          message.success(`已删除 ${selectedRowKeys.length} 条记录`);
          setSelectedRowKeys([]);
          fetchData();
        } catch (err) {
          message.error(err.response?.data?.error || '删除失败');
        }
      },
    });
  }, [selectedRowKeys, data, fetchData]);

  // ==================== 导出 Excel ====================
  const handleExport = useCallback(() => {
    let exportData;
    if (selectedRowKeys.length > 0) {
      // 有选中行 → 仅导出选中行
      const keySet = new Set(selectedRowKeys);
      exportData = data.filter(r => keySet.has(r.id));
    } else {
      // 无选中行 → 导出当前筛选结果（data 已经是筛选后的数据）
      exportData = data;
    }

    if (exportData.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    exportToExcel(exportData);
  }, [selectedRowKeys, data]);

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
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={5} style={{ margin: 0 }}>全量申请列表</Title>
          <Tooltip title="仅可删除已发放状态的记录">
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handleBatchDelete}
            >
              删除{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              导出
            </Button>
          </Tooltip>
        </Space>
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
        </Space>
      </Space>
      <ResizableTable
        rowKey="id"
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={paginationConfig}
        onChange={handleTableChange}
        scroll={{ x: 1100 }}
      />
    </Card>
  );
}
