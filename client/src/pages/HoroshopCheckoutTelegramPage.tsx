import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { HoroshopCheckoutTelegramConfig } from '../types/horoshop-checkout-telegram';
import '../styles/horoshop-checkout-telegram.css';

const QR_SIZE_MIN = 160;
const QR_SIZE_MAX = 320;
const BUTTON_FONT_SIZE_MIN = 12;
const BUTTON_FONT_SIZE_MAX = 24;
const BUTTON_RADIUS_MIN = 0;
const BUTTON_RADIUS_MAX = 32;

function formatDate(value: string | null) {
  if (!value) return 'Ще не публікувалося';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function isTelegramBotUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    const username = url.pathname.split('/').filter(Boolean)[0] || '';
    return url.protocol === 'https:'
      && ['t.me', 'telegram.me'].includes(host)
      && /^[a-z0-9_]{5,32}$/iu.test(username);
  } catch {
    return false;
  }
}

function isIntegerInRange(value: number, minimum: number, maximum: number) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function valueInRange(value: number, minimum: number, maximum: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  return <label className="checkout-telegram-color-field">
    <span>{label}</span>
    <span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><code>{value}</code></span>
  </label>;
}

interface NumberFieldProps {
  label: string;
  ariaLabel: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}

function NumberField({ label, ariaLabel, value, minimum, maximum, onChange }: NumberFieldProps) {
  const valid = isIntegerInRange(value, minimum, maximum);
  return <label className="checkout-telegram-field">
    <span>{label}</span>
    <input
      aria-label={ariaLabel}
      aria-invalid={!valid}
      className={valid ? undefined : 'is-invalid'}
      type="number"
      inputMode="numeric"
      step={1}
      min={minimum}
      max={maximum}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    <small className={valid ? undefined : 'is-error'}>
      {valid ? `Допустимо: ${minimum}–${maximum} px.` : `Вкажіть ціле число від ${minimum} до ${maximum} px.`}
    </small>
  </label>;
}

export function HoroshopCheckoutTelegramPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settingsQuery = useQuery({
    queryKey: ['horoshop-checkout-telegram-settings'],
    queryFn: api.horoshopCheckoutTelegram.settings
  });
  const [config, setConfig] = useState<HoroshopCheckoutTelegramConfig | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const saveDraft = useMutation({ mutationFn: api.horoshopCheckoutTelegram.saveDraft });
  const publish = useMutation({ mutationFn: api.horoshopCheckoutTelegram.publish });
  const setEnabled = useMutation({ mutationFn: api.horoshopCheckoutTelegram.setEnabled });

  useEffect(() => {
    if (settingsQuery.data) setConfig(settingsQuery.data.draftConfig);
  }, [settingsQuery.data]);

  const telegramUrl = config?.telegramUrl || '';
  const configuredQrSize = viewport === 'mobile' ? config?.mobileQrSize : config?.qrSize;
  const qrSize = valueInRange(configuredQrSize || 240, QR_SIZE_MIN, QR_SIZE_MAX, 240);
  const validUrl = isTelegramBotUrl(telegramUrl);
  useEffect(() => {
    let active = true;
    if (!validUrl) {
      setQrCodeDataUrl('');
      return () => { active = false; };
    }
    QRCode.toDataURL(telegramUrl.trim(), {
      width: qrSize,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' }
    }).then((value) => {
      if (active) setQrCodeDataUrl(value);
    }).catch(() => {
      if (active) setQrCodeDataUrl('');
    });
    return () => { active = false; };
  }, [qrSize, telegramUrl, validUrl]);

  const isDirty = useMemo(() => Boolean(
    config && settingsQuery.data && JSON.stringify(config) !== JSON.stringify(settingsQuery.data.draftConfig)
  ), [config, settingsQuery.data]);

  if (settingsQuery.isError) {
    return <div className="checkout-telegram-tool-state is-error">Не вдалося завантажити інструмент.</div>;
  }
  if (settingsQuery.isLoading || !config || !settingsQuery.data) {
    return <div className="checkout-telegram-tool-state">Завантажуємо налаштування Telegram-блоку…</div>;
  }

  const settings = settingsQuery.data;
  const busy = saveDraft.isPending || publish.isPending || setEnabled.isPending;
  const sizesValid = isIntegerInRange(config.buttonBorderRadius, BUTTON_RADIUS_MIN, BUTTON_RADIUS_MAX)
    && isIntegerInRange(config.buttonFontSize, BUTTON_FONT_SIZE_MIN, BUTTON_FONT_SIZE_MAX)
    && isIntegerInRange(config.qrSize, QR_SIZE_MIN, QR_SIZE_MAX)
    && isIntegerInRange(config.mobileButtonFontSize, BUTTON_FONT_SIZE_MIN, BUTTON_FONT_SIZE_MAX)
    && isIntegerInRange(config.mobileQrSize, QR_SIZE_MIN, QR_SIZE_MAX);
  const configuredFontSize = viewport === 'mobile' ? config.mobileButtonFontSize : config.buttonFontSize;
  const previewFontSize = valueInRange(configuredFontSize, BUTTON_FONT_SIZE_MIN, BUTTON_FONT_SIZE_MAX, 16);
  const update = <K extends keyof HoroshopCheckoutTelegramConfig>(key: K, value: HoroshopCheckoutTelegramConfig[K]) => {
    setConfig((current) => current ? { ...current, [key]: value } : current);
  };

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['horoshop-checkout-telegram-settings'] });
  }

  async function save() {
    if (!config) return;
    if (!sizesValid) {
      showToast('Перевірте розміри: QR-код — 160–320 px, шрифт — 12–24 px, скруглення — 0–32 px.', 'error');
      return;
    }
    try {
      await saveDraft.mutateAsync(config);
      await refresh();
      showToast('Чернетку Telegram-блоку збережено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти чернетку.', 'error');
    }
  }

  async function publishConfig() {
    if (!config || !validUrl) {
      showToast('Вкажіть коректне HTTPS-посилання виду https://t.me/назва_бота.', 'error');
      return;
    }
    if (!sizesValid) {
      showToast('Перевірте розміри: QR-код — 160–320 px, шрифт — 12–24 px, скруглення — 0–32 px.', 'error');
      return;
    }
    try {
      await publish.mutateAsync(config);
      await refresh();
      showToast('Telegram-блок опубліковано й увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося опублікувати Telegram-блок.', 'error');
    }
  }

  async function toggleEnabled() {
    try {
      await setEnabled.mutateAsync(!settings.enabled);
      await refresh();
      showToast(settings.enabled ? 'Telegram-блок вимкнено.' : 'Telegram-блок увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити стан блоку.', 'error');
    }
  }

  async function copyEmbedCode() {
    try {
      await navigator.clipboard.writeText(settings.embedCode);
      showToast('Код встановлення скопійовано.', 'success');
    } catch {
      showToast('Не вдалося скопіювати код.', 'error');
    }
  }

  return <div className="checkout-telegram-tool-page">
    <header className="checkout-telegram-tool-heading">
      <div>
        <p className="eyebrow">Хорошоп · сторінка подяки</p>
        <h1>Telegram після замовлення</h1>
        <p>Статичний QR-код і кнопка ведуть покупця до Telegram-бота після успішного оформлення. QR оновлюється автоматично разом із посиланням.</p>
      </div>
      <div className={`checkout-telegram-tool-status${settings.enabled ? ' is-active' : ''}`}>
        <span />
        <div><strong>{settings.enabled ? 'Блок активний' : 'Блок вимкнений'}</strong><small>{settings.storeDomain || 'Домен Хорошопа не підключено'}</small></div>
      </div>
    </header>

    <div className="checkout-telegram-workspace">
      <section className="checkout-telegram-panel">
        <header><div><p className="eyebrow">Налаштування</p><h2>Посилання та кнопка</h2><p>QR-код і кнопка завжди використовують одне опубліковане посилання.</p></div>{isDirty && <span className="checkout-telegram-unsaved">Є незбережені зміни</span>}</header>
        <label className="checkout-telegram-field">
          <span>Посилання на Telegram-бота</span>
          <input aria-label="Посилання на Telegram-бота" type="url" value={config.telegramUrl} onChange={(event) => update('telegramUrl', event.target.value)} placeholder="https://t.me/your_bot?start=order" />
          {config.telegramUrl && !validUrl && <small className="is-error">Потрібне HTTPS-посилання t.me або telegram.me з коректним іменем.</small>}
        </label>
        <label className="checkout-telegram-field">
          <span>Текст кнопки</span>
          <input aria-label="Текст кнопки" value={config.buttonText} onChange={(event) => update('buttonText', event.target.value.slice(0, 80))} maxLength={80} />
        </label>

        <div className="checkout-telegram-colors">
          <ColorField label="Колір кнопки" value={config.buttonBackgroundColor} onChange={(value) => update('buttonBackgroundColor', value)} />
          <ColorField label="Колір при наведенні" value={config.buttonHoverBackgroundColor} onChange={(value) => update('buttonHoverBackgroundColor', value)} />
          <ColorField label="Колір тексту" value={config.buttonTextColor} onChange={(value) => update('buttonTextColor', value)} />
          <ColorField label="Колір рамки" value={config.buttonBorderColor} onChange={(value) => update('buttonBorderColor', value)} />
        </div>

        <div className="checkout-telegram-shared-size">
          <NumberField label="Скруглення кнопки, px" ariaLabel="Скруглення кнопки" minimum={BUTTON_RADIUS_MIN} maximum={BUTTON_RADIUS_MAX} value={config.buttonBorderRadius} onChange={(value) => update('buttonBorderRadius', value)} />
        </div>
        <div className="checkout-telegram-device-sizes">
          <section className="checkout-telegram-device-size-group" aria-labelledby="checkout-telegram-desktop-sizes">
            <h3 id="checkout-telegram-desktop-sizes"><Icon name="monitor" size={16} /> Десктоп</h3>
            <div className="checkout-telegram-numbers">
              <NumberField label="QR-код, px" ariaLabel="Розмір QR-коду для десктопа" minimum={QR_SIZE_MIN} maximum={QR_SIZE_MAX} value={config.qrSize} onChange={(value) => update('qrSize', value)} />
              <NumberField label="Шрифт кнопки, px" ariaLabel="Розмір шрифту кнопки для десктопа" minimum={BUTTON_FONT_SIZE_MIN} maximum={BUTTON_FONT_SIZE_MAX} value={config.buttonFontSize} onChange={(value) => update('buttonFontSize', value)} />
            </div>
          </section>
          <section className="checkout-telegram-device-size-group" aria-labelledby="checkout-telegram-mobile-sizes">
            <h3 id="checkout-telegram-mobile-sizes"><Icon name="phone" size={16} /> Мобільний</h3>
            <div className="checkout-telegram-numbers">
              <NumberField label="QR-код, px" ariaLabel="Розмір QR-коду для мобільного" minimum={QR_SIZE_MIN} maximum={QR_SIZE_MAX} value={config.mobileQrSize} onChange={(value) => update('mobileQrSize', value)} />
              <NumberField label="Шрифт кнопки, px" ariaLabel="Розмір шрифту кнопки для мобільного" minimum={BUTTON_FONT_SIZE_MIN} maximum={BUTTON_FONT_SIZE_MAX} value={config.mobileButtonFontSize} onChange={(value) => update('mobileButtonFontSize', value)} />
            </div>
          </section>
        </div>
      </section>

      <section className="checkout-telegram-panel checkout-telegram-preview-panel">
        <header>
          <div><p className="eyebrow">Живий перегляд</p><h2>Сторінка після замовлення</h2></div>
          <div className="checkout-telegram-viewport-switch" aria-label="Розмір перегляду">
            <button className={viewport === 'desktop' ? 'is-active' : ''} type="button" onClick={() => setViewport('desktop')}><Icon name="monitor" size={16} /> Десктоп</button>
            <button className={viewport === 'mobile' ? 'is-active' : ''} type="button" onClick={() => setViewport('mobile')}><Icon name="phone" size={16} /> Мобільний</button>
          </div>
        </header>
        <div className={`checkout-telegram-preview is-${viewport}`}>
          <div className="checkout-telegram-preview__site">
            <div className="checkout-telegram-preview__order"><strong>Ваше замовлення отримано</strong><span /><span /><span /><span /></div>
            <div className="checkout-telegram-preview__card" style={{ width: Math.min(qrSize + 48, 368) }}>
              {qrCodeDataUrl
                ? <a href={config.telegramUrl} target="_blank" rel="noreferrer"><img src={qrCodeDataUrl} alt="QR-код для переходу в Telegram" style={{ width: qrSize }} /></a>
                : <div className="checkout-telegram-preview__empty"><Icon name="qrCode" size={42} /><span>Вставте посилання, щоб створити QR-код</span></div>}
              <a className={!validUrl ? 'is-disabled' : ''} href={validUrl ? config.telegramUrl : undefined} target="_blank" rel="noreferrer" style={{ background: config.buttonBackgroundColor, borderColor: config.buttonBorderColor, borderRadius: config.buttonBorderRadius, color: config.buttonTextColor, fontSize: previewFontSize }}>{config.buttonText || 'Відкрити Telegram'}</a>
            </div>
          </div>
        </div>
        <p className="checkout-telegram-preview-note"><Icon name="visibility" size={15} /> На десктопі блок займає штатну праву колонку; на мобільному з’являється після підтвердження замовлення.</p>
      </section>
    </div>

    <div className="checkout-telegram-bottom-grid">
      <section className="checkout-telegram-panel checkout-telegram-install-card">
        <header><div><p className="eyebrow">Встановлення</p><h2>Один код для обох версій</h2><p>Додайте його в Хорошоп один раз перед <code>&lt;/body&gt;</code>. Публікація нових налаштувань не потребує заміни коду.</p></div></header>
        <pre>{settings.embedCode}</pre>
        <button className="button button--secondary" type="button" onClick={() => void copyEmbedCode()}><Icon name="copy" size={16} /> Копіювати код</button>
      </section>

      <section className="checkout-telegram-panel checkout-telegram-publish-card">
        <header><div><p className="eyebrow">Публікація</p><h2>Стан на сайті</h2></div></header>
        <dl>
          <div><dt>Версія</dt><dd>{settings.publishedVersion || '—'}</dd></div>
          <div><dt>Остання публікація</dt><dd>{formatDate(settings.publishedAt)}</dd></div>
        </dl>
        <div className="checkout-telegram-actions">
          <button className="button button--secondary" type="button" onClick={() => void save()} disabled={!isDirty || !sizesValid || busy}><Icon name="save" size={16} /> Зберегти чернетку</button>
          <button className="button button--primary" type="button" onClick={() => void publishConfig()} disabled={!validUrl || !config.buttonText.trim() || !sizesValid || busy}><Icon name="publication" size={16} /> Опублікувати й увімкнути</button>
          <button className="checkout-telegram-enable-button" type="button" onClick={() => void toggleEnabled()} disabled={!settings.publishedVersion || busy}>{settings.enabled ? 'Тимчасово вимкнути блок' : 'Увімкнути опублікований блок'}</button>
        </div>
      </section>
    </div>
  </div>;
}
