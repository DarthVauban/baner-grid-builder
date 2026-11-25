import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/banner-generator';
import { horoshopWidgetTools } from '../lib/tools';
import { useToast } from '../toast/ToastContext';
import '../styles/horoshop-widgets.css';

export function HoroshopWidgetsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [releaseId, setReleaseId] = useState('');
  const catalog = useQuery({ queryKey: ['tool-catalog'], queryFn: ({ signal }) => api.users.toolCatalog(signal), staleTime: 30_000 });
  const accessByTool = new Map(catalog.data?.tools.map((item) => [item.toolId, item]));
  const visibleWidgets = horoshopWidgetTools.filter((widget) => accessByTool.get(widget.accessToolId)?.granted);
  const releaseHistory = useQuery({
    queryKey: ['horoshop-widget-releases'],
    queryFn: ({ signal }) => api.horoshopWidgets.releases(signal),
    enabled: visibleWidgets.length > 0
  });
  const releases = releaseHistory.data?.releases || [];
  const selectedRelease = releases.find((release) => release.id === releaseId) || releases[0];
  const embedCode = selectedRelease?.embedCode
    || `<script async src="${window.location.origin}/api/public/horoshop-widgets/embed.js"></script>`;
  const publish = useMutation({
    mutationFn: api.horoshopWidgets.publish,
    onSuccess: async (release) => {
      await queryClient.invalidateQueries({ queryKey: ['horoshop-widget-releases'] });
      setReleaseId(release.id);
      showToast('Випуск створено. Код готовий для встановлення в Хорошопі.', 'success');
    },
    onError: (error) => showToast(error.message, 'error')
  });

  async function copyEmbedCode() {
    try {
      await copyToClipboard(embedCode);
      showToast('Спільний скрипт скопійовано.', 'success');
    } catch {
      showToast('Не вдалося скопіювати скрипт.', 'error');
    }
  }

  return <div className="horoshop-widgets-page">
    <header className="page-heading horoshop-widgets-page__heading">
      <Link className="horoshop-widgets-page__back" to="/tools"><Icon name="chevronLeft" size={16} /> Усі інструменти</Link>
      <p className="eyebrow">Вітрина Хорошопа</p>
      <h1>Віджети Хорошопа</h1>
      <p>Керуйте глобальними віджетами магазину й копіюйте код для встановлення в Хорошопі.</p>
    </header>

    {catalog.isLoading && !catalog.data && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо віджети…</p></div>}
    {catalog.isError && !catalog.data && <div className="task-list-state task-list-state--error" role="alert"><p>Не вдалося завантажити доступні віджети.</p><button className="button button--secondary" type="button" onClick={() => void catalog.refetch()}>Спробувати ще</button></div>}
    {catalog.data && visibleWidgets.length === 0 && <div className="task-list-state"><Icon name="storefront" size={28} /><h2>Немає доступних віджетів</h2><p>Зверніться до адміністратора, щоб отримати доступ.</p></div>}

    {visibleWidgets.length > 0 && <>
      <section className="horoshop-widgets-setup" aria-labelledby="horoshop-widgets-install-title">
        <div className="horoshop-widgets-setup__heading">
          <span className="horoshop-widgets-setup__icon"><Icon name="copy" size={22} /></span>
          <div><p className="eyebrow">Встановлення</p><h2 id="horoshop-widgets-install-title">Спільний скрипт</h2><p>Один і той самий код для всіх глобальних віджетів.</p></div>
          <button className="button button--primary" type="button" disabled={releaseHistory.isPending || releaseHistory.isError} onClick={() => void copyEmbedCode()}><Icon name="copy" size={17} /> Копіювати скрипт</button>
        </div>
        {releaseHistory.isPending && <p>Завантажуємо випуски…</p>}
        {releaseHistory.isError && <div role="alert">Не вдалося завантажити випуски. <button className="button button--secondary" type="button" onClick={() => void releaseHistory.refetch()}>Спробувати ще</button></div>}
        {releaseHistory.data && <>
          <div className="horoshop-widgets-setup__release">
            {selectedRelease
              ? <label>Випуск
                <StyledSelect
                  ariaLabel="Випуск"
                  value={selectedRelease.id}
                  onChange={setReleaseId}
                  options={releases.map((release) => ({
                    value: release.id,
                    label: `${new Date(release.publishedAt).toLocaleString('uk-UA')} · ${release.storeDomain} · ${release.buildSha.slice(0, 8)} · ${release.publisherName}`
                  }))}
                />
              </label>
              : <p>Код сумісності для чинного підключення. Адміністратор із 2FA може підготувати випуск із перевіркою цілісності.</p>}
            {releaseHistory.data.canPublish && <button className="button button--secondary" type="button" disabled={publish.isPending} onClick={() => publish.mutate()}>
              {publish.isPending ? 'Створюємо випуск…' : 'Створити випуск'}
            </button>}
          </div>
          <pre className="horoshop-widgets-setup__code"><code>{embedCode}</code></pre>
        </>}
        <div className="horoshop-widgets-setup__steps">
          <p><strong>1</strong><span>Додайте код перед <code>&lt;/body&gt;</code> у глобальний шаблон Хорошопа.</span></p>
          <p><strong>2</strong><span>Якщо desktop і mobile мають окремі шаблони, вставте цей самий код в обидва.</span></p>
          <p><strong>3</strong><span>Після перевірки приберіть старі індивідуальні скрипти віджетів.</span></p>
        </div>
        <p className="horoshop-widgets-setup__note">Випуск фіксує код і частину опублікованих налаштувань. Для встановлення чи відкату виберіть випуск і замініть код у Хорошопі. Мапа магазинів і вставки для окремих сторінок мають власний код.</p>
      </section>

      <section className="horoshop-widgets-list" aria-labelledby="horoshop-widgets-list-title">
        <div className="horoshop-widgets-list__heading"><div><p className="eyebrow">Налаштування</p><h2 id="horoshop-widgets-list-title">Ваші віджети</h2></div><span>{visibleWidgets.length} у переліку</span></div>
        <div className="horoshop-widgets-list__grid">
          {visibleWidgets.map((widget) => {
            const access = accessByTool.get(widget.accessToolId);
            const content = <>
              <span className="horoshop-widget-card__icon"><Icon name={widget.icon} size={22} /></span>
              <span className="horoshop-widget-card__content"><strong>{widget.name}</strong><small>{access?.blockedByTwoFactor ? 'Для відкриття увімкніть 2FA у профілі.' : widget.description}</small></span>
              <span className="horoshop-widget-card__arrow"><Icon name={access?.blockedByTwoFactor ? 'security' : 'arrow'} size={17} /></span>
            </>;
            return access?.accessible
              ? <Link className="horoshop-widget-card" to={widget.path} key={widget.id}>{content}</Link>
              : <article className="horoshop-widget-card horoshop-widget-card--disabled" aria-disabled="true" key={widget.id}>{content}</article>;
          })}
        </div>
      </section>
    </>}
  </div>;
}
