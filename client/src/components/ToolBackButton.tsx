import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

interface ToolBackButtonProps {
  fallbackPath?: string;
  className?: string;
}

export function isWorkspaceToolPath(pathname: string) {
  return pathname === '/chat' || pathname.startsWith('/tools/');
}

export function ToolBackButton({ fallbackPath = '/tools', className = '' }: ToolBackButtonProps) {
  const location = useLocation();
  const navigate = useNavigate();

  function goBack() {
    if (location.key === 'default') {
      navigate(fallbackPath);
      return;
    }
    navigate(-1);
  }

  return <button
    className={`tool-back-button${className ? ` ${className}` : ''}`}
    type="button"
    onClick={goBack}
    aria-label="Повернутися на попередню сторінку"
    title="Назад"
  >
    <Icon name="arrowLeft" size={18} />
    <span>Назад</span>
  </button>;
}
