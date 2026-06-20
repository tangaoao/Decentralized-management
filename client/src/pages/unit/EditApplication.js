/**
 * 修改被退回的申请，重新提交
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Typography, message, Alert, Space, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { appAPI, userAPI } from '../../api';

const { Title } = Typography;
const { TextArea } = Input;
const ISSUE_NO_PATTERN = /^202\d-411381-[A-Z]{2,10}-\d{6,10}$/;

export default function EditApplication() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [application, setApplication] = useState(null);
  const [banks, setBanks] = useState([]);

  // 加载原申请数据
  useEffect(() => {
    const load = async () => {
      try {
        const res = await appAPI.list();
        const app = res.data.data.find(a => String(a.id) === String(id));
        if (!app) {
          message.error('申请不存在');
          navigate('/unit', { replace: true });
          return;
        }
        if (app.status !== 'RETURNED') {
          message.error('该申请不是退回状态，无法修改');
          navigate('/unit', { replace: true });
          return;
        }
        setApplication(app);
        form.setFieldsValue({
          project_name: app.project_name,
          issue_no: app.issue_no,
          assigned_bank: app.assigned_bank,
          reason: app.reason,
          unit_name: app.unit_name,
        });
      } catch (err) {
        message.error('加载申请数据失败');
        navigate('/unit', { replace: true });
      } finally {
        setFetching(false);
      }
    };
    load();
  }, [id, form, navigate]);

  // 加载银行列表
  useEffect(() => {
    userAPI.listBanks()
      .then(res => setBanks(res.data.data || []))
      .catch(() => message.error('获取银行列表失败'));
  }, []);

  /** 提交修改 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await appAPI.resubmit(id, {
        project_name: values.project_name,
        issue_no: values.issue_no,
        assigned_bank: values.assigned_bank,
        reason: values.reason || '',
        unit_name: values.unit_name,
      });
      message.success('修改成功，已重新提交审核');
      navigate('/unit', { replace: true });
    } catch (err) {
      if (err.response) {
        message.error(err.response.data?.error || '提交失败');
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/unit')}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      <Card>
        <Title level={4}>修改申请 — {application?.application_no}</Title>

        {/* 退回原因提示 */}
        {application?.return_reason && (
          <Alert
            message="退回原因"
            description={application.return_reason}
            type="error"
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Form form={form} layout="vertical">
          <Form.Item
            name="project_name"
            label="项目名称"
            rules={[
              { required: true, message: '请输入项目名称' },
              { max: 100, message: '不能超过100个字符' },
            ]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>

          <Form.Item
            name="issue_no"
            label="发放单号"
            rules={[
              { required: true, message: '请输入发放单号' },
              { pattern: ISSUE_NO_PATTERN, message: '格式错误，示例：202*-411381-****-********' },
            ]}
          >
            <Input placeholder="202*-411381-****-********" />
          </Form.Item>

          <Form.Item
            name="assigned_bank"
            label="分配银行"
            rules={[{ required: true, message: '请选择审核银行' }]}
          >
            <Select
              placeholder="请选择审核银行"
              options={banks.map(b => ({ value: b.username, label: b.bank_name }))}
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="申请理由"
            rules={[{ max: 500, message: '不能超过500个字符' }]}
          >
            <TextArea rows={3} placeholder="请输入申请理由（选填）" />
          </Form.Item>

          <Form.Item name="unit_name" label="单位名称">
            <Input disabled />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" onClick={handleSubmit} loading={loading}>
                提交修改
              </Button>
              <Button onClick={() => navigate('/unit')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
