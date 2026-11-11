import { useState } from 'react';
import type { FeedAction, FeedOffer, FeedOperationItem } from '../../types/horoshop-feeds';

export const feedLabels = { google: 'Google Merchant Center', facebook: 'Facebook' };
export const feedNames = { google: 'Google Feed for Merchant Center', facebook: 'Facebook Feed' };
export const stateLabels = { enabled: 'Увімкнено', disabled: 'Вимкнено', mixed: 'Частина модифікацій', unknown: 'Немає даних' };
export const statusLabels = { draft: 'Перегляд', queued: 'У черзі', running: 'Виконується', completed: 'Завершено', partial: 'Частково виконано', conflict: 'Конфлікт', failed: 'Помилка' };
const itemLabels = { pending: 'Очікує', writing: 'Перевіряємо запис', succeeded: 'Підтверджено', unchanged: 'Без змін', failed: 'Не підтверджено', conflict: 'Конфлікт', cancelled: 'Не записано' };
export const choices = [{ value: 'keep', label: 'Не змінювати' }, { value: 'enable', label: 'Додати до фіда' }, { value: 'disable', label: 'Прибрати з фіда' }] as const;
export const actionLabel = (action: FeedAction) => (['google', 'facebook'] as const)
  .map((channel) => `${channel === 'google' ? 'Google' : 'Facebook'}: ${choices.find((choice) => choice.value === action[channel])?.label}`).join(' · ');

function currentState(offers: FeedOffer[], channel: keyof FeedAction) {
  if (!offers.length || offers.some((offer) => offer.marketplaces === null)) return stateLabels.unknown;
  const enabled = offers.filter((offer) => offer.marketplaces?.includes(feedNames[channel])).length;
  return enabled === offers.length ? stateLabels.enabled : enabled === 0 ? stateLabels.disabled : stateLabels.mixed;
}

function plannedState(before: FeedOffer[], action: FeedAction, channel: keyof FeedAction) {
  return action[channel] === 'enable' ? stateLabels.enabled : action[channel] === 'disable' ? stateLabels.disabled : currentState(before, channel);
}

export function FeedOperationRows({ items, action }: { items: FeedOperationItem[]; action: FeedAction }) {
  const [limit, setLimit] = useState(50);
  return <>
    <div className="hp-table-wrap"><table><thead><tr><th>Товар</th><th>Google Merchant Center</th><th>Facebook</th><th>Результат</th></tr></thead><tbody>
      {items.slice(0, limit).map((item) => {
        const before = item.resolvedBefore || item.before;
        return <tr key={item.id}>
          <td><strong>{item.title}</strong><small>{item.article}</small>
            <details className="hf-offers"><summary>Модифікацій: {item.articles.length}</summary>
              {before.map((offer) => {
                const target = (item.resolvedTarget || item.target).find((entry) => entry.article === offer.article)?.marketplaces;
                return <div key={offer.article}><strong>{offer.article}</strong>
                <small>Було: {offer.marketplaces === null ? 'Немає даних' : offer.marketplaces.join('; ') || 'Жодного фіда'}</small>
                <small>Буде: {target == null ? actionLabel(action) : target.join('; ') || 'Жодного фіда'}</small>
              </div>; })}
            </details>
          </td>
          {(['google', 'facebook'] as const).map((channel) => <td key={channel}><small>Було: {currentState(before, channel)}</small><strong>Буде: {plannedState(before, action, channel)}</strong>{action[channel] === 'keep' && <small>Без змін</small>}{item.observed && <small>Перевірено: {currentState(item.observed, channel)}</small>}</td>)}
          <td><span className={`hp-item-status is-${item.status}`}>{itemLabels[item.status]}</span>{item.message && <small>{item.message}</small>}</td>
        </tr>;
      })}
    </tbody></table></div>
    {items.length > limit && <button className="button button--secondary hp-show-more" type="button" onClick={() => setLimit((value) => value + 50)}>Показати ще 50</button>}
  </>;
}
