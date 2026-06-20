/**
 * 财政端穿透明细：展示某个发放单号下的所有申请 + 受控分页
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Typography, Card, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { appAPI } from '../../api';
import StatusTag from '../../components/StatusTag';
import ResizableTable from '../../components/ResizableTable';

const { Title } = Typography;

export default function IssueDetail() {
  const { issueNo } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // ==================== 受控分页 state ====================
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1); // 切换发放单号时回到第 1 页
    setLoading(true);
    appAPI.byIssue(issueNo)
      .then(res => setData(res.data.data || []))
      .catch(() => message.error('获取明细失败'))
      .finally(() => setLoading(false));
  }, [issueNo]);

  // 数据变化时检查越界
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(data.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [data.length, pageSize]);
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
    { title: '申请日期', dataIndex: 'application_date', width: 180 },
    { title: '申请人', dataIndex: 'applicant', width: 100 },
    { title: '银行名称', dataIndex: 'bank_name', width: 140 },
    { title: '单位名称', dataIndex: 'unit_name', width: 140 },
    { title: '申请理由', dataIndex: 'reason', ellipsis: true, render: v => v || '-' },
    { title: '状态', dataIndex: 'status', width: 110, render: s => <StatusTag status={s} /> },
    { title: '审核人', dataIndex: 'auditor', width: 100, render: v => v || '-' },
    { title: '审核日期', dataIndex: 'audit_date', width: 180, render: v => v || '-' },
    { title: '审核备注', dataIndex: 'audit_remark', ellipsis: true, render: v => v || '-' },
    { title: '退回原因', dataIndex: 'return_reason', ellipsis: true, render: v => v || '-' },
  ], []);

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/finance/summary')}
        style={{ marginBottom: 16 }}
      >
        返回汇总
      </Button>

      <Card>
        <Title level={4}>
          发放单号 {decodeURIComponent(issueNo)} 的二次发放明细
        </Title>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={paginationConfig}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
}
