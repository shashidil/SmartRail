import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, getToken, setSession, clearSession } from '../api';

const homeFor = (role) => (role === 'admin' ? '/admin' : '/dashboard');

// Confirms the session with the server before rendering a protected page, so access
// never depends on browser-editable data alone.
const RequireAuth = ({ role, children }) => {
  const [state, setState] = useState({ status: 'checking', user: null });

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setState({ status: 'denied', user: null });
      return undefined;
    }
    api
      .get('/api/me')
      .then((res) => {
        if (cancelled) return;
        setSession({ user: res.data.user });
        setState({ status: 'ok', user: res.data.user });
      })
      .catch((err) => {
        if (cancelled) return;
        // A 401 is handled by the api interceptor (it redirects to /login).
        if (err.response?.status !== 401) clearSession();
        setState({ status: 'denied', user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'checking') return null;
  if (state.status === 'denied') return <Navigate to="/login" replace />;
  if (role && state.user.role !== role) return <Navigate to={homeFor(state.user.role)} replace />;
  return children;
};

export default RequireAuth;
