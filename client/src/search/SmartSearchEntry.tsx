import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';

export function SmartSearchEntry() {
  const entry = useQuery({
    queryKey: ['smart-search-entry'],
    queryFn: ({ signal }) => api.smartSearch.entry(signal),
    staleTime: 30_000,
    retry: false
  });
  const url = entry.data?.url;

  return <section className="tools-catalog" aria-label="Розумний пошук">
    {url ? <a className="tool-category tool-category--link" href={url}>
      <span className="tool-category__icon"><Icon name="search" size={21} /></span>
      <span className="tool-category__copy"><strong>Розумний пошук</strong><small>Керування пошуком і каталогом товарів</small></span>
      <span className="tool-category__arrow" aria-hidden="true"><Icon name="arrow" size={18} /></span>
    </a> : <article className="tool-category" aria-disabled="true">
      <span className="tool-category__copy"><strong>Розумний пошук</strong><small>{entry.isLoading ? 'Перевіряємо доступність…' : 'Сервіс тимчасово недоступний.'}</small></span>
    </article>}
  </section>;
}
