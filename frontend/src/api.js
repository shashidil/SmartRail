import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = axios.create({ baseURL: BASE_URL });

const FLASH_KEY = 'authMessage';

export const getToken = () => localStorage.getItem('token');

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
};

export const setSession = ({ token, user }) => {
  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// One-shot message shown on the login screen after a forced sign-out.
export const takeAuthMessage = () => {
  try {
    const message = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return message || '';
  } catch {
    return '';
  }
};

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on any protected call means the session is gone (expired, revoked, deactivated).
const PUBLIC_PATHS = ['/api/login', '/api/register'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !PUBLIC_PATHS.some((p) => url.startsWith(p))) {
      clearSession();
      try {
        sessionStorage.setItem(FLASH_KEY, 'Your session has expired. Please log in again.');
      } catch {
        // storage unavailable; the redirect still happens
      }
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);
