import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/banner-generator';
import { horoshopWidgetTools } from '../lib/tools';
import { useToast } from '../toast/ToastContext';
import '../styles/horoshop-widgets.css';

export function HoroshopWidgetsPage() {
  const { showToast } = useToast();
  const catalog = useQuery({ queryKey: ['tool-catalog'], queryFn: ({ signal }) => api.users.toolCatalog(signal), staleTime: 30_000 });
  const accessByTool = new Map(catalog.data?.tools.map((item) => [item.toolId, item]));
  const visibleWidgets = horoshopWidgetTools.filter((widget) => accessByTool.get(widget.accessToolId)?.granted);
  const embedCode = `<script async src="${window.location.origin}/api/public/horoshop-widgets/embed.js"></script>`;

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
      <p>Один скрипт для глобальних віджетів магазину. Встановіть його один раз, а поведінку кожного віджета налаштовуйте тут.</p>
    </header>

    {catalog.isLoading && !catalog.data && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо віджети…</p></div>}
    {catalog.isError && !catalog.data && <div className="task-list-state task-list-state--error" role="alert"><p>Не вдалося завантажити доступні віджети.</p><button className="button button--secondary" type="button" onClick={() => void catalog.refetch()}>Спробувати ще</button></div>}
    {catalog.data && visibleWidgets.length === 0 && <div className="task-list-state"><Icon name="storefront" size={28} /><h2>Немає доступних віджетів</h2><p>Зверніться до адміністратора, щоб отримати доступ.</p></div>}

    {visibleWidgets.length > 0 && <>
      <section className="horoshop-widgets-setup" aria-labelledby="horoshop-widgets-install-title">
        <div className="horoshop-widgets-setup__heading">
          <span className="horoshop-widgets-setup__icon"><Icon name="copy" size={22} /></span>
          <div><p className="eyebrow">Встановлення</p><h2 id="horoshop-widgets-install-title">Спільний скрипт</h2><p>Один і той самий код для всіх глобальних віджетів.</p></div>
          <button className="button button--primary" type="button" onClick={() => void copyEmbedCode()}><Icon name="copy" size={17} /> Копіювати скрипт</button>
        </div>
        <pre className="horoshop-widgets-setup__code"><code>{embedCode}</code></pre>
        <div className="horoshop-widgets-setup__steps">
          <p><strong>1</strong><span>Додайте код перед <code>&lt;/body&gt;</code> у глобальний шаблон Хорошопа.</span></p>
          <p><strong>2</strong><span>Якщо desktop і mobile мають окремі шаблони, вставте цей самий код в обидва.</span></p>
          <p><strong>3</strong><span>Після перевірки приберіть старі індивідуальні скрипти віджетів.</span></p>
        </div>
        <p className="horoshop-widgets-setup__note">Скрипт підключає опубліковані віджети за їхніми налаштуваннями. Мапа магазинів і вставки для окремих сторінок мають власний код.</p>
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
