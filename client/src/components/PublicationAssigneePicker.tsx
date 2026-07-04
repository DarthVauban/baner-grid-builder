import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getInitials } from '../lib/user';
import type { PublicationPerson } from '../types/publication';
import { Icon } from './Icon';

export function PublicationAssigneePicker({ value, self, onChange }: {
  value: PublicationPerson;
  self?: PublicationPerson;
  onChange: (person: PublicationPerson) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [search, setSearch] = useState('');
  const results = useQuery({
    queryKey: ['publication-assignee-search', search],
    queryFn: () => api.users.search(search.trim()),
    enabled: changing && search.trim().length >= 2,
    staleTime: 60_000
  });
  const normalizedSearch = search.trim().toLowerCase();
  const selfMatches = Boolean(self && self.id !== value.id && (
    self.name.toLowerCase().includes(normalizedSearch) || self.email.toLowerCase().includes(normalizedSearch)
  ));

  if (!changing) {
    return (
      <div className="publication-assignee">
        <span className="mini-avatar mini-avatar--accepted">{getInitials(value.name)}</span>
        <span><strong>{value.name}</strong><small>{value.email}</small></span>
        <button type="button" onClick={() => setChanging(true)}>Змінити</button>
      </div>
    );
  }

  return (
    <div className="publication-assignee-picker">
      <div className="publication-assignee-picker__search"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus placeholder="Ім’я або email" /><button type="button" onClick={() => { setChanging(false); setSearch(''); }} aria-label="Скасувати"><Icon name="close" size={16} /></button></div>
      {search.trim().length >= 2 && <div className="publication-assignee-picker__results">
        {selfMatches && self && <button type="button" onClick={() => { onChange(self); setChanging(false); setSearch(''); }}><strong>{self.name}</strong><small>{self.email} · Ви</small></button>}
        {results.isLoading && <p>Шукаємо…</p>}
        {!results.isLoading && !results.data?.length && !selfMatches && <p>Користувачів не знайдено.</p>}
        {results.data?.map((person) => <button type="button" key={person.id} onClick={() => { onChange(person); setChanging(false); setSearch(''); }}><strong>{person.name}</strong><small>{person.email}</small></button>)}
      </div>}
    </div>
  );
}
