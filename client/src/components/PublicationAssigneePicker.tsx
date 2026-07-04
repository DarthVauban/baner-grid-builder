import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getInitials } from '../lib/user';
import type { PublicationPerson } from '../types/publication';
import { Icon } from './Icon';

export function PublicationAssigneePicker({ value, onChange }: {
  value: PublicationPerson | null;
  onChange: (person: PublicationPerson | null) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [search, setSearch] = useState('');
  const results = useQuery({
    queryKey: ['publication-assignee-search', search],
    queryFn: () => api.users.search(search.trim()),
    enabled: changing,
    staleTime: 60_000
  });

  if (!changing) {
    return (
      <div className="publication-assignee">
        {value ? <span className="mini-avatar mini-avatar--accepted">{getInitials(value.name)}</span> : <span className="publication-assignee__empty"><Icon name="users" size={17} /></span>}
        <span><strong>{value?.name || 'Не призначено'}</strong><small>{value?.email || 'Відповідального можна додати пізніше'}</small></span>
        <span className="publication-assignee__actions">{value && <button type="button" onClick={() => onChange(null)}>Зняти</button>}<button type="button" onClick={() => setChanging(true)}>{value ? 'Змінити' : 'Обрати'}</button></span>
      </div>
    );
  }

  return (
    <div className="publication-assignee-picker">
      <div className="publication-assignee-picker__search"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus placeholder="Ім’я або email" /><button type="button" onClick={() => { setChanging(false); setSearch(''); }} aria-label="Скасувати"><Icon name="close" size={16} /></button></div>
      <div className="publication-assignee-picker__results">
        {results.isLoading && <p>Шукаємо…</p>}
        {!results.isLoading && !results.data?.length && <p>Користувачів не знайдено.</p>}
        {results.data?.map((person) => <button type="button" key={person.id} onClick={() => { onChange(person); setChanging(false); setSearch(''); }}><strong>{person.name}</strong><small>{person.email}</small></button>)}
      </div>
    </div>
  );
}
