/**
 * 审核弹窗：通过发放 / 退回修改
 * - 通过：备注可选
 * - 退回：原因必填
 */
import React, { useState } from 'react';
import { Modal, Descriptions, Form, Input, Space, Button, message } from 'antd';
import { CheckCircleOutlined, RollbackOutlined } from '@ant-design/icons';
import { appAPI } from '../../api';

const { TextArea } = Input;

export default function AuditModal({ visible, record, onCancel, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState(null); // 'approve' | 'return'
  const [remark, setRemark] = useState('');
  const [returnReason, setReturnReason] = useState('');

  // 重置状态
  const resetAndClose = () => {
    setAction(null);
    setRemark('');
    setReturnReason('');
    setLoading(false);
    onCancel();
  };

  /** 通过发放 */
  const handleApprove = async () => {
    setAction('approve');
    setLoading(true);
    try {
      await appAPI.audit(record.id, {
        audit_remark: remark || undefined,
      });
      message.success('审核通过，已发放');
      resetAndClose();
      onSuccess();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  /** 退回修改 */
  const handleReturn = async () => {
    if (!returnReason.trim()) {
      message.warning('请填写退回原因');
      return;
    }
    setAction('return');
    setLoading(true);
    try {
      await appAPI.return(record.id, {
        return_reason: returnReason.trim(),
      });
      message.success('已退回申请');
      resetAndClose();
      onSuccess();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  if (!record) return null;

  return (
    <Modal
      title="审核操作"
      open={visible}
      onCancel={resetAndClose}
      footer={null}
      width={560}
    >
      {/* 申请详情 */}
      <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="申请单号">{record.application_no}</Descriptions.Item>
        <Descriptions.Item label="发放单号">{record.issue_no}</Descriptions.Item>
        <Descriptions.Item label="项目名称" span={2}>{record.project_name}</Descriptions.Item>
        <Descriptions.Item label="银行名称">{record.bank_name || record.assigned_bank}</Descriptions.Item>
        <Descriptions.Item label="单位名称">{record.unit_name}</Descriptions.Item>
        <Descriptions.Item label="申请理由" span={2}>{record.reason || '-'}</Descriptions.Item>
        <Descriptions.Item label="申请日期" span={2}>{record.application_date}</Descriptions.Item>
      </Descriptions>

      {/* 审核备注（可选） */}
      <Form layout="vertical">
        <Form.Item label="审核备注（可选）">
          <TextArea
            rows={2}
            value={remark}
            onChange={e => setRemark(e.target.value)}
            placeholder="输入审核备注..."
          />
        </Form.Item>

        {/* 退回原因 */}
        <Form.Item
          label="退回原因"
          required
          style={{ borderTop: '1px dashed #d9d9d9', paddingTop: 12 }}
        >
          <TextArea
            rows={2}
            value={returnReason}
            onChange={e => setReturnReason(e.target.value)}
            placeholder="若退回修改，请务必填写退回原因"
          />
        </Form.Item>
      </Form>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
        <Button onClick={resetAndClose}>取消</Button>
        <Button
          danger
          icon={<RollbackOutlined />}
          loading={loading && action === 'return'}
          onClick={handleReturn}
        >
          退回修改
        </Button>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={loading && action === 'approve'}
          onClick={handleApprove}
          style={{ background: '#52c41a', borderColor: '#52c41a' }}
        >
          通过发放
        </Button>
      </div>
    </Modal>
  );
}
