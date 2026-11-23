import { useCallback, useState } from 'react';
import { useBeforeUnload, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { SiteThemePromoBarPreview, SiteThemePromoBarSettings } from '../site-themes/SiteThemePromoBar';
import { useToast } from '../toast/ToastContext';
import type { SiteTheme, SiteThemeInput } from '../types/site-theme';
import '../styles/site-themes.css';

const queryKey = ['site-themes'] as const;
const blankTheme: SiteThemeInput = {
  name: '',
  promoBar: {
    text: 'Спеціальна пропозиція',
    buttonText: '',
    buttonUrl: '',
    backgroundColor: '#171923',
    textColor: '#ffffff',
    buttonColor: '#f5ce62',
    buttonTextColor: '#171923',
    alignment: 'center',
    paddingY: 8,
    paddingX: 16,
    showDesktop: true,
    showMobile: true
  }
};

function matchesDraft(input: SiteThemeInput, saved: SiteThemeInput) {
  return input.name === saved.name && (Object.keys(input.promoBar) as Array<keyof SiteThemeInput['promoBar']>)
    .every((field) => input.promoBar[field] === saved.promoBar[field]);
}

function statusLabel(theme: SiteTheme) {
  if (theme.active) return 'На сайті';
  if (theme.publishedAt) return 'Вимкнена';
  return 'Чернетка';
}

function ThemeSwitch({
  label, checked, disabled, onClick
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return <button
    type="button"
    className="site-themes__switch"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    onClick={onClick}
  ><span /></button>;
}

interface EditorState {
  id: string | null;
  input: SiteThemeInput;
}

export function SiteThemesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const list = useQuery({ queryKey, queryFn: ({ signal }) => api.siteThemes.list(signal) });
  const listUnavailable = list.isError && !list.data;
  const themes = list.data ?? [];
  const theme = themes.find((item) => item.id === editor?.id);
  const dirty = Boolean(editor && !matchesDraft(editor.input, theme ?? blankTheme));
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<void>) => operation(),
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onError: (error) => showToast(error instanceof Error ? error.message : 'Не вдалося змінити тему.', 'error'),
    onSettled: () => queryClient.invalidateQueries({ queryKey })
  });
  const busy = mutation.isPending;

  useBeforeUnload(useCallback((event) => {
    if (!dirty && !busy) return;
    event.preventDefault();
    event.returnValue = '';
  }, [busy, dirty]));

  function updateCachedTheme(saved: SiteTheme) {
    queryClient.setQueryData<SiteTheme[]>(queryKey, (current = []) => [
      saved,
      ...current.filter((item) => item.id !== saved.id).map((item) => (
        saved.active && item.active ? { ...item, active: false } : item
      ))
    ]);
  }

  function selectTheme(selected: SiteTheme) {
    setEditor({ id: selected.id, input: { name: selected.name, promoBar: selected.promoBar } });
  }

  async function confirmExit() {
    if (busy) return false;
    return !dirty || confirm({
      title: 'Вийти з редактора?',
      message: 'Незбережені зміни буде втрачено.',
      confirmLabel: 'Вийти',
      cancelLabel: 'Продовжити редагування'
    });
  }

  async function exitEditor(destination: 'tools' | 'library') {
    if (!await confirmExit()) return;
    if (destination === 'tools') navigate('/tools');
    else setEditor(null);
  }

  function saveDraft(publish: boolean) {
    if (!editor) return;
    const { id, input } = editor;
    if (!input.name.trim()) {
      showToast('Введіть назву теми.', 'error');
      document.getElementById('site-theme-name')?.focus();
      return;
    }
    if (publish && !input.promoBar.text.trim()) {
      showToast('Введіть текст промосмуги, щоб опублікувати тему.', 'error');
      return;
    }
    if (publish && Boolean(input.promoBar.buttonText.trim()) !== Boolean(input.promoBar.buttonUrl.trim())) {
      showToast('Заповніть текст і посилання кнопки або залиште обидва поля порожніми.', 'error');
      return;
    }

    mutation.mutate(async () => {
      const saved = theme && !dirty
        ? theme
        : id
          ? await api.siteThemes.update(id, input)
          : await api.siteThemes.create(input);
      updateCachedTheme(saved);
      selectTheme(saved);

      if (!publish) {
        showToast('Чернетку збережено.', 'success');
        return;
      }
      const published = await api.siteThemes.publish(saved.id);
      updateCachedTheme(published);
      selectTheme(published);
      showToast(published.active ? 'Зміни опубліковано.' : 'Тему опубліковано. Увімкніть її, щоб показати на сайті.', 'success');
    });
  }

  async function toggleActive(selected: SiteTheme) {
    const previous = themes.find((item) => item.active && item.id !== selected.id);
    if (!selected.active && previous && !await confirm({
      title: 'Змінити активну тему?',
      message: `«${selected.name}» замінить «${previous.name}» на сайті.`,
      confirmLabel: 'Увімкнути тему'
    })) return;
    mutation.mutate(async () => {
      const updated = await api.siteThemes.setActive(selected.id, !selected.active);
      updateCachedTheme(updated);
      showToast(updated.active ? 'Тему ввімкнено на сайті.' : 'Тему вимкнено на сайті.', 'success');
    });
  }

  function togglePromoBar(selected: SiteTheme) {
    mutation.mutate(async () => {
      const updated = await api.siteThemes.setPromoBarEnabled(selected.id, !selected.promoBarEnabled);
      updateCachedTheme(updated);
      showToast(updated.promoBarEnabled ? 'Промосмугу ввімкнено.' : 'Промосмугу вимкнено.', 'success');
    });
  }

  async function removeTheme(selected: SiteTheme) {
    if (!await confirm({
      title: 'Видалити тему?',
      message: `«${selected.name}» буде видалено з бібліотеки.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    })) return;
    mutation.mutate(async () => {
      await api.siteThemes.remove(selected.id);
      queryClient.setQueryData<SiteTheme[]>(queryKey, (current = []) => current.filter((item) => item.id !== selected.id));
      showToast('Тему видалено.', 'success');
    });
  }

  const enabled = theme?.promoBarEnabled ?? true;
  const canPublish = Boolean(!theme?.publishedAt || dirty || theme.hasUnpublishedChanges);

  return <div className="site-themes">
    <header className="site-themes__toolbar">
      <button type="button" className="site-themes__back" disabled={busy} onClick={() => void exitEditor('tools')}>
        <Icon name="arrowLeft" size={18} /> До інструментів
      </button>
      <h1>Теми сайту</h1>
    </header>

    <main className="site-themes__main">
      {editor ? <>
        <nav className="site-themes__views" aria-label="Теми сайту">
          <button type="button" disabled={busy} onClick={() => void exitEditor('library')}>Бібліотека тем</button>
          <span aria-current="page">Редактор</span>
        </nav>
        <section className="site-themes__editor-header" aria-label="Дії з темою">
          <div className="site-themes__name-block">
            <label htmlFor="site-theme-name">Назва теми</label>
            <input
              id="site-theme-name"
              value={editor.input.name}
              maxLength={120}
              placeholder="Наприклад, Чорна п’ятниця"
              disabled={busy}
              onChange={(event) => setEditor({ ...editor, input: { ...editor.input, name: event.target.value } })}
            />
            <span className="site-themes__hint" role="status">{dirty ? 'Є незбережені зміни' : !theme?.publishedAt
              ? 'Тему ще не опубліковано' : theme.hasUnpublishedChanges ? 'Є неопубліковані зміни' : 'Опубліковано'}</span>
          </div>
          <div className="site-themes__editor-actions">
            <div className="site-themes__theme-toggle">
              <span>Тема на сайті</span>
              <ThemeSwitch
                label="Тема на сайті"
                checked={Boolean(theme?.active)}
                disabled={busy || !theme?.publishedAt}
                onClick={() => theme && void toggleActive(theme)}
              />
            </div>
            <button type="button" className="button button--secondary" disabled={busy || Boolean(theme && !dirty)} onClick={() => saveDraft(false)}>
              Зберегти чернетку
            </button>
            <button type="button" className="button button--primary" disabled={busy || !canPublish} onClick={() => saveDraft(true)}>
              {theme?.publishedAt ? 'Опублікувати зміни' : 'Опублікувати тему'}
            </button>
          </div>
        </section>

        <div className="site-themes__editor">
          <section className="site-themes__panel site-themes__elements" aria-labelledby="site-theme-elements-heading">
            <header className="site-themes__panel-header">
              <h3 id="site-theme-elements-heading">Елементи теми</h3>
            </header>
            <div className="site-themes__element">
              <Icon name="popup" size={20} />
              <div><strong>Верхня промосмуга</strong><small>Над шапкою сайту</small></div>
              <ThemeSwitch label="Показувати верхню промосмугу" checked={enabled} disabled={busy || !theme} onClick={() => theme && togglePromoBar(theme)} />
            </div>
            {!theme && <p className="site-themes__hint site-themes__element-hint">Перемикач доступний після збереження теми.</p>}
          </section>

          <SiteThemePromoBarPreview config={editor.input.promoBar} enabled={enabled} />
          <SiteThemePromoBarSettings
            config={editor.input.promoBar}
            disabled={busy}
            onChange={(patch) => setEditor({ ...editor, input: { ...editor.input, promoBar: { ...editor.input.promoBar, ...patch } } })}
          />
        </div>
      </> : <section aria-labelledby="site-theme-library-heading">
        <header className="site-themes__library-header">
          <div>
            <h2 id="site-theme-library-heading">Бібліотека тем</h2>
            <p>Створюйте теми й керуйте показом промосмуги на вітрині Хорошопа.</p>
          </div>
          <button
            type="button"
            className="button button--primary"
            disabled={list.isPending || listUnavailable || busy}
            onClick={() => setEditor({ id: null, input: blankTheme })}
          ><Icon name="add" size={18} /> Створити тему</button>
        </header>
        {list.isPending ? <div className="site-themes__empty" role="status">Завантажуємо теми…</div>
          : listUnavailable ? <div className="site-themes__empty">
            <p role="alert">{list.error instanceof Error ? list.error.message : 'Не вдалося завантажити теми.'}</p>
            <button className="button button--secondary" type="button" onClick={() => void list.refetch()}>Спробувати ще раз</button>
          </div>
          : themes.length === 0 ? <div className="site-themes__empty">
            <Icon name="storefront" size={30} />
            <h3>Тут з’являться ваші теми</h3>
            <p>Створіть першу тему для підключеного магазину та налаштуйте її промосмугу.</p>
          </div>
          : <ul className="site-themes__library">
            {themes.map((item) => <li className="site-themes__card" key={item.id}>
              <div className="site-themes__card-preview" style={{ color: item.promoBar.textColor, backgroundColor: item.promoBar.backgroundColor }}>
                <span>{item.promoBar.text || 'Верхня промосмуга'}</span>
              </div>
              <div className="site-themes__card-body">
                <div className="site-themes__card-heading">
                  <h3>{item.name}</h3>
                  <span className={`site-themes__badge${item.active ? ' site-themes__badge--active' : ''}`}>{statusLabel(item)}</span>
                </div>
                {item.publishedAt && item.hasUnpublishedChanges && <p className="site-themes__hint">Є неопубліковані зміни</p>}
                <div className="site-themes__card-actions">
                  <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => selectTheme(item)}>Редагувати</button>
                  {item.publishedAt && <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void toggleActive(item)}>
                    {item.active ? 'Вимкнути' : 'Увімкнути'}
                  </button>}
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Дублювати тему «${item.name}»`}
                    title="Дублювати"
                    onClick={() => setEditor({ id: null, input: { name: `${item.name.slice(0, 112)} — копія`, promoBar: item.promoBar } })}
                  ><Icon name="copy" size={17} /></button>
                  {!item.active && <button
                    type="button"
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Видалити тему «${item.name}»`}
                    title="Видалити"
                    onClick={() => void removeTheme(item)}
                  ><Icon name="delete" size={17} /></button>}
                </div>
              </div>
            </li>)}
          </ul>}
      </section>}
    </main>
  </div>;
}
