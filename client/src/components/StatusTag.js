/**
 * 状态标签组件：根据 status 显示不同颜色
 */
import React from 'react';
import { Tag } from 'antd';

export const STATUS_MAP = {
  PENDING:  { color: 'orange', text: '待银行审核' },
  ISSUED:   { color: 'green',  text: '已发放' },
  RETURNED: { color: 'red',    text: '已退回' },
};

export default function StatusTag({ status }) {
  const cfg = STATUS_MAP[status] || { color: 'default', text: status || '未知' };
  return <Tag color={cfg.color}>{cfg.text}</Tag>;
}
