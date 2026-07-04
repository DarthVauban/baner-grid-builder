import { getInitials } from '../lib/user';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  className?: string;
}

export function UserAvatar({ name, avatarUrl = '', className = '' }: UserAvatarProps) {
  return <span className={`avatar${className ? ` ${className}` : ''}`}>
    {avatarUrl ? <img src={avatarUrl} alt="" /> : getInitials(name)}
  </span>;
}
