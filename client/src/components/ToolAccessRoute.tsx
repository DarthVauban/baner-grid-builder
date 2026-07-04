import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import type { ToolId } from '../types/tool';
import { LoadingScreen } from './LoadingScreen';

export function ToolAccessRoute({ tool }: { tool: ToolId }) {
  const access = useQuery({
    queryKey: ['tool-access'],
    queryFn: api.users.toolAccess,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });

  if (access.isLoading) return <LoadingScreen />;
  if (access.isError || !access.data?.includes(tool)) return <Navigate to="/tools" replace />;
  return <Outlet />;
}
