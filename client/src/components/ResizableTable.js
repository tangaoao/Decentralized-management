/**
 * 可拖拽列宽的表格组件
 * 基于 antd Table + react-resizable，支持：
 * - 所有列均可拖拽（含无 width 的列，自动计算初始宽度）
 * - 最小宽度 = 表头文字宽度
 * - 最大宽度 = 列内最长内容宽度的 2 倍
 * - 鼠标悬停在两列之间出现 ↔ 箭头，拖拽调整宽度
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table } from 'antd';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';

// ==================== 文字测量 ====================

let measureCanvas = null;

function getMeasureCtx() {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  const ctx = measureCanvas.getContext('2d');
  ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  return ctx;
}

/** 测量文字渲染宽度（px），含左右 padding + sort icon 预留 */
function measureTextWidth(text) {
  if (!text) return 0;
  const ctx = getMeasureCtx();
  ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const headerW = ctx.measureText(String(text)).width;
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const dataW = ctx.measureText(String(text)).width;
  return Math.max(headerW, dataW) + 48; // 32px padding + 16px sort icon
}

// ==================== 拖拽手柄 ====================

/**
 * 自定义拖拽手柄：8px 宽全高度竖条，定位在列右边界
 * 必须用 React.forwardRef + 透传 props，确保 react-resizable 的 mouse 事件能绑定到 DOM
 */
const Handle = React.forwardRef((props, ref) => (
  <div
    {...props}
    ref={ref}
    className={`resizable-table-handle ${props.className || ''}`}
    style={{
      ...props.style,
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 8,
      cursor: 'col-resize',
      zIndex: 1,
      background: 'transparent',
    }}
    // 阻止点击冒泡，防止触发 antd 列排序
    onClick={(e) => e.stopPropagation()}
  >
    <div
      className="resizable-table-handle-line"
      style={{
        position: 'absolute',
        right: 3,
        top: '20%',
        height: '60%',
        width: 2,
        borderRadius: 1,
        background: 'transparent',
        transition: 'background 0.15s',
      }}
    />
  </div>
));
Handle.displayName = 'Handle';

// ==================== 可拖拽表头（memo 避免无关列重渲染）====================

const ResizableTitle = React.memo((props) => {
  const { onResizeStop, width, ...restProps } = props;

  // 所有列都有 width（已在 ResizableTable 中自动补全），无需 width 检查
  if (!onResizeStop) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      onResizeStop={onResizeStop}
      axis="x"
      draggableOpts={{ enableUserSelectHack: false }}
      handle={<Handle />}
    >
      <th {...restProps} />
    </Resizable>
  );
});
ResizableTitle.displayName = 'ResizableTitle';

// ==================== 表格组件 ====================

export default function ResizableTable(props) {
  const { columns: externalColumns, dataSource, ...restProps } = props;

  // ---- 计算列宽约束（min / max）----
  const constraints = useMemo(() => {
    const map = {};
    if (!externalColumns) return map;

    externalColumns.forEach((col, index) => {
      const key = col.key || col.dataIndex || index;
      const headerText = typeof col.title === 'string' ? col.title : String(key);
      const headerW = measureTextWidth(headerText);

      // 遍历数据找最长值
      let maxContentW = headerW;
      if (dataSource && col.dataIndex) {
        const renderFn = col.render;
        for (const row of dataSource) {
          const rawValue = row[col.dataIndex];
          const displayValue = renderFn ? renderFn(rawValue, row, index) : rawValue;
          if (typeof displayValue === 'string' || typeof displayValue === 'number') {
            const w = measureTextWidth(String(displayValue));
            if (w > maxContentW) maxContentW = w;
          }
        }
      }

      map[key] = {
        minWidth: Math.max(headerW, 50),
        maxWidth: Math.max(maxContentW * 2, headerW * 2, 120),
      };
    });
    return map;
  }, [externalColumns, dataSource]);

  // 用 ref 保持最新的 constraints，避免 handleResizeStop 依赖 constraints 导致 mergedColumns 在 dataSource 变化时重建
  const constraintsRef = useRef(constraints);
  constraintsRef.current = constraints;

  // ---- 为无 width 的列自动计算初始宽度 ----
  const normalizeColumn = useCallback((col) => {
    if (col.width) return col;
    const headerText = typeof col.title === 'string' ? col.title : String(col.key || col.dataIndex || '');
    return { ...col, width: measureTextWidth(headerText) };
  }, []);

  // ---- 列 state（仅在拖拽结束或外部 columns 变化时更新）----
  const [columns, setColumns] = useState(() =>
    externalColumns.map(normalizeColumn)
  );

  // 用 ref 保存最新 columns，让 onResizeStop 闭包不依赖 columns state
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // 外部 columns 结构变化时同步
  const columnsFingerprint = useMemo(
    () =>
      externalColumns
        .map((c) => `${c.key || c.dataIndex}:${c.width}`)
        .join('|'),
    [externalColumns]
  );

  useEffect(() => {
    setColumns(externalColumns.map(normalizeColumn));
  }, [columnsFingerprint]); // eslint-disable-line

  // ---- 拖拽结束回调（唯一更新 state 的时机）----
  // 通过 ref 读取 constraints，避免 dataSource 变化导致 handleResizeStop / mergedColumns 重建
  const handleResizeStop = useCallback(
    (index) => (e, { size }) => {
      e.stopPropagation();
      const cols = columnsRef.current;
      const col = cols[index];
      const key = col.key || col.dataIndex || index;
      const curConstraints = constraintsRef.current[key] || {
        minWidth: 50,
        maxWidth: 600,
      };
      const clamped = Math.min(Math.max(size.width, curConstraints.minWidth), curConstraints.maxWidth);

      setColumns((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], width: clamped };
        return next;
      });
    },
    [] // 空依赖：函数引用永不变化，mergedColumns 只在 columns 状态变化时重建
  );

  // ---- 合并列属性（仅在 columns 或 handleResizeStop 变化时重算）----
  const mergedColumns = useMemo(
    () =>
      columns.map((col, index) => ({
        ...col,
        onHeaderCell: (column) => ({
          width: column.width,
          onResizeStop: handleResizeStop(index),
        }),
      })),
    [columns, handleResizeStop]
  );

  return (
    <Table
      {...restProps}
      columns={mergedColumns}
      dataSource={dataSource}
      components={{
        header: {
          cell: ResizableTitle,
        },
      }}
    />
  );
}
