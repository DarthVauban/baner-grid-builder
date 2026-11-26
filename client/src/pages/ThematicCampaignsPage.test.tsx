import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import ThematicCampaignsPage from './ThematicCampaignsPage';

vi.mock('../dialogs/ConfirmDialogContext', () => ({ useConfirmDialog: () => vi.fn() }));
vi.mock('../toast/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
afterEach(() => { vi.restoreAllMocks(); });

it('adds unique parent products across pastes and ambiguous choices, then saves merged categories', async () => {
  const phone = { id: 'one', title: 'Телефон', sku: 'P1', availability: 'В наявності', category: 'phones', categoryName: 'Телефони' };
  const cable = { id: 'two', title: 'Кабель', sku: 'C1', availability: 'Очікується', category: 'cables', categoryName: 'Кабелі' };
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
  expect(screen.getByText('Очікується')).toHaveClass('horoshop-badge--waiting');
  fireEvent.click(screen.getByLabelText(/Об’єднати товари/u));
  fireEvent.click(screen.getByRole('option', { name: 'Телефони' }));
  fireEvent.click(screen.getByLabelText('Режим старої ціни'));
  fireEvent.click(screen.getByRole('option', { name: 'Відсоток до поточної ціни' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Надбавка, %' }), { target: { value: '15' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Червона акційна ціна/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Зберегти акцію' }));
  expect((await screen.findByLabelText('Код для Хорошопа') as HTMLTextAreaElement).value).toContain('/widget/embed.js');
  expect(save).toHaveBeenCalledWith({
    generation: 'gen', name: 'Акція', pricing: { priceMode: 'percent', priceValue: 15, highlightPromoPrice: true },
    sections: [{ id: expect.any(String), name: 'Телефони', categories: ['phones', 'cables'], productIds: ['one', 'two'] }]
  });
});

it('shows catalog availability on saved product cards and removes only the selected product', async () => {
  const apiClient = api.thematicCampaigns;
  const campaign = { id: 'saved', revision: 1, publicId: 'widget', name: 'Весняна акція' };
  const pricing = { priceMode: 'fixed', priceValue: 200, highlightPromoPrice: false } as const;
  vi.spyOn(apiClient, 'list').mockResolvedValue([campaign]);
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    ...campaign, generation: 'gen', pricing, sections: [{ id: 'cleaning', name: 'Прибирання', categories: ['cleaning'], products: [
      { id: 'first', title: 'Пилосос А', sku: 'A1', availability: 'В наявності' },
      { id: 'second', title: 'Пилосос Б', sku: 'B2', availability: 'Немає в наявності' },
      { id: 'third', title: 'Пилосос В', sku: 'C3', availability: null },
      { id: 'fourth', title: 'Пилосос Г', sku: 'D4', availability: 'В наявності', inactive: true }
    ] }]
  });
  const update = vi.spyOn(apiClient, 'update').mockResolvedValue({ ...campaign, revision: 2 });
  render(<QueryClientProvider client={new QueryClient()}><ThematicCampaignsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: campaign.name }));
  expect(await screen.findByRole('spinbutton', { name: 'Надбавка, грн' })).toHaveValue(200);
  fireEvent.click(await screen.findByRole('button', { name: 'Товари (4)' }));
  const [available, unavailable, unknown, inactive] = screen.getAllByRole('listitem').map((item) => within(item));
  expect(available.getByText('В наявності')).toHaveClass('horoshop-badge--available');
  expect(unavailable.getByText('B2')).toBeInTheDocument();
  expect(unavailable.getByText('Немає в наявності')).toHaveClass('horoshop-badge--unavailable');
  expect(unknown.getByText('Наявність не вказана')).toBeInTheDocument();
  expect(inactive.getByText('Відсутній у каталозі')).toBeInTheDocument();

  fireEvent.click(unavailable.getByRole('button', { name: 'Прибрати Пилосос Б з акції' }));
  expect(screen.queryByText('Пилосос Б')).toBeNull();
  expect(screen.getByRole('button', { name: 'Товари (3)' })).toBeInTheDocument();
  fireEvent.click(inactive.getByRole('button', { name: 'Прибрати Пилосос Г з акції' }));
  fireEvent.click(screen.getByRole('button', { name: 'Зберегти акцію' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith('saved', {
    generation: 'gen', name: campaign.name, pricing,
    sections: [{ id: 'cleaning', name: 'Прибирання', categories: ['cleaning'], productIds: ['first', 'third'] }]
  }, 1));
});
