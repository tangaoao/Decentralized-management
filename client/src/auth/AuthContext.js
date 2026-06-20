/**
 * 认证上下文：提供全局 user / token / login / logout
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // 应用启动时，如果有 token，验证其有效性
  useEffect(() => {
    if (token) {
      authAPI.me()
        .then(res => setUser(res.data))
        .catch(() => {
          // token 无效，清除
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-next-line

  /** 登录 */
  const login = useCallback(async (username, password) => {
    const res = await authAPI.login(username, password);
    const { token: newToken, user: newUser } = res.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  /** 退出 */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  /** 更新认证信息（改密成功后替换 token 和 user） */
  const updateAuth = useCallback((newToken, newUser) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  /** 根据角色获取首页路径 */
  function getHomePath(role) {
    switch (role) {
      case 'UNIT':    return '/unit';
      case 'BANK':    return '/bank';
      case 'FINANCE': return '/finance';
      default:        return '/login';
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateAuth, getHomePath, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook: 在组件中获取认证上下文 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return ctx;
}

export default AuthContext;
