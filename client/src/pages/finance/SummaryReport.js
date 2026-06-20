/**
 * 财政端汇总报表：按发放单号分组，卡片形式展示
 * 支持按项目名称 / 发放单号模糊搜索，点击卡片穿透明细
 */
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Spin, message, Typography, Input, Space, Tag, Select } from 'antd';
import { FileTextOutlined, SearchOutlined, ProjectOutlined } from '@ant-design/icons';
import { appAPI } from '../../api';

const { Title, Text } = Typography;

export default function SummaryReport() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // 模糊搜索关键词
  const [searchProject, setSearchProject] = useState('');
  const [searchIssueNo, setSearchIssueNo] = useState('');

  // 申请次数筛选：默认仅展示 >1 次的单号
  const [countFilter, setCountFilter] = useState('gt1'); // 'gt1' | 'all'

  useEffect(() => {
    appAPI.summary()
      .then(res => setGroups(res.data.data || []))
      .catch(() => message.error('获取汇总数据失败'))
      .finally(() => setLoading(false));
  }, []);

  // 客户端模糊过滤
  const filtered = useMemo(() => {
    return groups.filter(g => {
      const matchProject = !searchProject
        || (g.project_names && g.project_names.toLowerCase().includes(searchProject.toLowerCase()));
      const matchIssue = !searchIssueNo
        || (g.issue_no && g.issue_no.includes(searchIssueNo));
      // 申请次数筛选：默认排除 count=1 的记录
      const matchCount = countFilter === 'all' || g.count > 1;
      return matchProject && matchIssue && matchCount;
    });
  }, [groups, searchProject, searchIssueNo, countFilter]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  const totalCards = groups.length;
  const showingCards = filtered.length;

  return (
    <div>
      {/* 标题行 + 搜索框 */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Title level={5} style={{ margin: 0 }}>汇总报表（按发放单号）</Title>
        <Space wrap>
          <Input
            prefix={<ProjectOutlined />}
            placeholder="模糊搜索项目名称"
            value={searchProject}
            onChange={e => setSearchProject(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="模糊搜索发放单号"
            value={searchIssueNo}
            onChange={e => setSearchIssueNo(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
          <Select
            value={countFilter}
            onChange={setCountFilter}
            style={{ width: 160 }}
            options={[
              { value: 'gt1', label: '申请次数 > 1' },
              { value: 'all', label: '全部申请记录' },
            ]}
          />
        </Space>
      </Space>

      {/* 搜索结果提示 */}
      {(searchProject || searchIssueNo) && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          共 {totalCards} 个批次，匹配 {showingCards} 个
        </Text>
      )}
      {/* 申请次数默认筛选提示 */}
      {countFilter === 'gt1' && !searchProject && !searchIssueNo && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          默认仅展示申请次数 &gt; 1 的批次，共 {showingCards} 个（已隐藏 {totalCards - showingCards} 个单次申请）
        </Text>
      )}

      {/* 卡片网格 */}
      <Row gutter={[16, 16]}>
        {filtered.map(g => {
          const projectList = g.project_names
            ? g.project_names.split(',').filter(Boolean)
            : [];

          return (
            <Col xs={24} sm={12} lg={8} key={g.issue_no}>
              <Card
                hoverable
                onClick={() => navigate(`/finance/issue/${encodeURIComponent(g.issue_no)}`)}
                style={{ borderTop: '3px solid #1890ff' }}
              >
                <Statistic
                  title="发放批次"
                  value={g.issue_no}
                  valueStyle={{ fontSize: 16 }}
                  prefix={<FileTextOutlined />}
                />

                {/* 关联项目名称 */}
                {projectList.length > 0 && (
                  <div style={{ marginTop: 8, marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
                      <ProjectOutlined /> 关联项目：
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      {projectList.map((name, idx) => (
                        <Tag key={idx} color="blue" style={{ marginBottom: 4 }}>
                          {name.trim()}
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}

                <Row gutter={16} style={{ marginTop: 12 }}>
                  <Col span={8}>
                    <Statistic
                      title="申请次数"
                      value={g.count}
                      valueStyle={{ color: '#1890ff', cursor: 'pointer', textDecoration: 'underline', fontSize: 20 }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic title="待审核" value={g.pending_count} valueStyle={{ color: '#faad14', fontSize: 20 }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="已发放" value={g.issued_count} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
                  </Col>
                </Row>
              </Card>
            </Col>
          );
        })}
      </Row>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
          {groups.length === 0 ? '暂无汇总数据' : '没有匹配的批次'}
        </div>
      )}
    </div>
  );
}
