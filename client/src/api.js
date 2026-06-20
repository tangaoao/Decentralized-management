/**
 * Axios 实例 + 请求/响应拦截器 + 所有 API 调用函数
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 请求拦截器：自动附加 JWT token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：401 自动跳转登录页
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      // 非登录页才跳转
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ==================== 认证 API ====================
export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),

  /** 强制修改密码（password_reset_required=1 时使用） */
  changePassword: (password, confirmPassword) =>
    api.post('/auth/change-password', { password, confirmPassword }),
};

// ==================== 申请业务 API ====================
export const appAPI = {
  /** 获取申请列表（可选 ?status=PENDING|ISSUED|RETURNED），支持 AbortSignal */
  list: (params, signal) => api.get('/applications', { params, signal }),

  /** 创建申请（UNIT） */
  create: (data) => api.post('/applications', data),

  /** 审核通过（BANK） */
  audit: (id, data) => api.put(`/applications/${id}/audit`, data),

  /** 退回申请（BANK） */
  return: (id, data) => api.put(`/applications/${id}/return`, data),

  /** 修改重提（UNIT） */
  resubmit: (id, data) => api.put(`/applications/${id}/resubmit`, data),

  /** 汇总报表（FINANCE） */
  summary: () => api.get('/applications/summary'),

  /** 穿透明细（FINANCE） */
  byIssue: (issueNo) => api.get(`/applications/by-issue/${encodeURIComponent(issueNo)}`),

  /** 批量删除申请（FINANCE，仅限 ISSUED 状态） */
  deleteBatch: (ids) => api.delete('/applications/batch', { data: { ids } }),
};

// ==================== 用户管理 API ====================
export const userAPI = {
  /** 获取银行用户列表（下拉选项用） */
  listBanks: () => api.get('/users/banks'),

  /** 获取所有用户（FINANCE） */
  list: () => api.get('/users'),

  /** 新增用户（FINANCE） */
  create: (data) => api.post('/users', data),

  /** 修改用户信息（FINANCE） */
  update: (id, data) => api.put(`/users/${id}`, data),

  /** 重置用户密码为 123456（FINANCE） */
  resetPassword: (id) => api.put(`/users/${id}/reset-password`),

  /** 删除用户（FINANCE） */
  delete: (id) => api.delete(`/users/${id}`),

  /** 启用/禁用用户（FINANCE） */
  toggleActive: (id) => api.put(`/users/${id}/toggle-active`),
};

// ==================== 部门管理 API ====================
export const departmentAPI = {
  /** 获取部门树 */
  tree: () => api.get('/departments/tree'),

  /** 获取部门下用户列表（可选 params: { recursive: true } 递归查下级） */
  users: (id, params) => api.get(`/departments/${id}/users`, { params }),

  /** 新增部门 */
  create: (data) => api.post('/departments', data),

  /** 更新部门名称 */
  update: (id, data) => api.put(`/departments/${id}`, data),

  /** 移动部门 */
  move: (id, data) => api.put(`/departments/${id}/move`, data),

  /** 批量更新排序 */
  reorder: (items) => api.put('/departments/reorder', { items }),

  /** 删除部门 */
  delete: (id) => api.delete(`/departments/${id}`),
};

export default api;
