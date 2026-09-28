import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import type { ToolId } from '../types/tool';
import { LoadingScreen } from './LoadingScreen';

export function ToolAccessRoute({ tool }: { tool: ToolId }) {
  const access = useQuery({
    queryKey: ['tool-access'],
    queryFn: ({ signal }) => api.users.toolAccess(signal),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true
  });

  if (access.isLoading) return <LoadingScreen />;
  // A failed background check does not revoke the last confirmed access.
  // Every tool API still independently checks permissions on the server.
  if (!access.data) return <div className="task-list-state task-list-state--error" role="alert">
    <p>Не вдалося перевірити доступ до інструмента.</p>
    <button className="button button--secondary" disabled={access.isFetching} onClick={() => void access.refetch()}>Спробувати ще</button>
  </div>;
  if (!access.data.includes(tool)) return <Navigate to="/tools" replace />;
  return <Outlet />;
}
