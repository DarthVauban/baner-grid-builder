import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BlogPublication } from '../types/publication';
import { PublicationCard } from './PublicationCard';

const publication: BlogPublication = {
  id: 'publication-1',
  title: 'Summer campaign article',
  description: 'Publish the prepared article.',
  status: 'published',
  publishAt: '2099-07-10T09:00:00.000Z',
  publicationUrl: 'https://example.com/blog/summer-campaign',
  creator: { id: 'creator-1', name: 'Content Planner', email: 'planner@example.com' },
  assignee: null,
  materials: [{ id: 'material-1', type: 'google_doc', label: 'Article draft', url: 'https://docs.google.com/document/d/example/edit' }],
  publishedAt: '2099-07-10T09:05:00.000Z',
  cancelledAt: null,
  createdAt: '2099-07-01T09:00:00.000Z',
  updatedAt: '2099-07-10T09:05:00.000Z'
};

describe('PublicationCard', () => {
  it('keeps resources visible and opens only from the details button', async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <PublicationCard publication={publication} viewMode="list" canEdit={false} busy={false} onOpen={onOpen} onEdit={vi.fn()} onStatus={vi.fn()} />
    );

    expect(screen.getByRole('link', { name: /Article draft/ })).toHaveAttribute('href', publication.materials[0].url);
    expect(screen.getByRole('link', { name: /Відкрити статтю/ })).toHaveAttribute('href', publication.publicationUrl);
    expect(screen.getByText('Поставив(-ла) задачу')).toBeInTheDocument();
    expect(screen.getByText('Не призначено')).toBeInTheDocument();

    await userEvent.click(container.querySelector('article')!);
    expect(onOpen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Деталі' }));
    expect(onOpen).toHaveBeenCalledWith(publication);
  });
});
