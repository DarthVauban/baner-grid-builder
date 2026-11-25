import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import ThematicCampaignsPage from './ThematicCampaignsPage';

vi.mock('../dialogs/ConfirmDialogContext', () => ({ useConfirmDialog: () => vi.fn() }));
vi.mock('../toast/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
afterEach(() => { vi.restoreAllMocks(); });

it('adds unique parent products across pastes and ambiguous choices, then saves merged categories', async () => {
  const phone = { id: 'one', title: 'Телефон', sku: 'P1', category: 'phones', categoryName: 'Телефони' };
  const cable = { id: 'two', title: 'Кабель', sku: 'C1', category: 'cables', categoryName: 'Кабелі' };
  const apiClient = api.thematicCampaigns;
  vi.spyOn(apiClient, 'list').mockResolvedValue([]);
  const resolve = vi.spyOn(apiClient, 'resolve').mockResolvedValueOnce({
    generation: 'gen', matched: [phone], duplicates: 2, unmatched: ['інше'], ambiguous: [{ input: 'Кабель', candidates: [cable] }]
  }).mockResolvedValueOnce({ generation: 'gen', matched: [phone, cable], duplicates: 0, unmatched: [], ambiguous: [] });
  const save = vi.spyOn(apiClient, 'create').mockResolvedValue({ id: 'saved', revision: 1, publicId: 'widget', name: 'Акція' });
  render(<QueryClientProvider client={new QueryClient()}><ThematicCampaignsPage /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Назва акції'), { target: { value: 'Акція' } });
  async function paste(text: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Вставити список' }));
    fireEvent.change(screen.getByLabelText('Назви або артикули'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати до акції' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }
  await paste('Телефон\nP1\nP1\nКабель\nінше');
  expect(resolve).toHaveBeenCalledWith(['Телефон', 'P1', 'P1', 'Кабель', 'інше']);
  fireEvent.click(screen.getByLabelText(/Уточніть/u));
  fireEvent.click(screen.getByRole('option', { name: 'Кабель · C1' }));
  await paste('Телефон\nC1');
  expect(screen.getByText('Додано товарів: 0 · Повторів: 2')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Товари (1)' })[1]);
  fireEvent.click(screen.getByLabelText(/Об’єднати товари/u));
  fireEvent.click(screen.getByRole('option', { name: 'Телефони' }));
  fireEvent.click(screen.getByRole('button', { name: 'Зберегти акцію' }));
  expect((await screen.findByLabelText('Код для Хорошопа') as HTMLTextAreaElement).value).toContain('/widget/embed.js');
  expect(save).toHaveBeenCalledWith({ generation: 'gen', name: 'Акція', sections: [
    { id: expect.any(String), name: 'Телефони', categories: ['phones', 'cables'], productIds: ['one', 'two'] }
  ] });
});
