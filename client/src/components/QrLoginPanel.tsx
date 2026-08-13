import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { QrLoginChallenge, QrLoginConfig, QrLoginStatusValue } from '../types/user';
import { Icon } from './Icon';

type QrUiState = 'loading' | QrLoginStatusValue | 'error';

interface QrLoginPanelProps {
  config: QrLoginConfig;
  returnPath: string;
  onAuthenticated: (returnPath: string) => void;
  onPasswordRequested: () => void;
}

function environmentLabel(config: QrLoginConfig) {
  return config.deployment.environment === 'production' ? 'Production' : 'DEV';
}

function countdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function QrLoginPanel({
  config,
  returnPath,
  onAuthenticated,
  onPasswordRequested
}: QrLoginPanelProps) {
  const { completeQrLogin } = useAuth();
  const [challenge, setChallenge] = useState<QrLoginChallenge | null>(null);
  const challengeRef = useRef<QrLoginChallenge | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [state, setState] = useState<QrUiState>('loading');
  const [remainingSeconds, setRemainingSeconds] = useState(config.ttlSeconds);
  const [error, setError] = useState('');

  const cancelChallenge = useCallback(async (target = challengeRef.current) => {
    if (!target) return;
    await api.auth.cancelQrLogin(target.challengeId, target.browserToken).catch(() => {});
    if (challengeRef.current?.challengeId === target.challengeId) challengeRef.current = null;
  }, []);

  const createChallenge = useCallback(async () => {
    const previous = challengeRef.current;
    challengeRef.current = null;
    if (previous) await cancelChallenge(previous);
    setState('loading');
    setChallenge(null);
    setQrCodeDataUrl('');
    setError('');
    try {
      const created = await api.auth.createQrLogin(returnPath);
      challengeRef.current = created;
      setChallenge(created);
      setState('pending');
      setRemainingSeconds(Math.max(0, Math.ceil((new Date(created.expiresAt).getTime() - Date.now()) / 1000)));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не вдалося створити QR-код.');
      setState('error');
    }
  }, [cancelChallenge, returnPath]);

  useEffect(() => {
    void createChallenge();
    return () => {
      const current = challengeRef.current;
      challengeRef.current = null;
      if (current) void api.auth.cancelQrLogin(current.challengeId, current.browserToken).catch(() => {});
    };
  }, [createChallenge]);

  useEffect(() => {
    if (!challenge?.qrPayload) return undefined;
    let active = true;
    QRCode.toDataURL(challenge.qrPayload, {
      width: 320,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' }
    }).then((value) => {
      if (active) setQrCodeDataUrl(value);
    }).catch(() => {
      if (!active) return;
      setError('Не вдалося відобразити QR-код. Створіть новий.');
      setState('error');
    });
    return () => {
      active = false;
    };
  }, [challenge?.qrPayload]);

  useEffect(() => {
    if (!challenge || !['pending', 'scanned'].includes(state)) return undefined;
    const update = () => setRemainingSeconds(Math.max(
      0,
      Math.ceil((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)
    ));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [challenge, state]);

  useEffect(() => {
    if (!challenge || !['pending', 'scanned'].includes(state)) return undefined;
    let active = true;
    let timer: number | undefined;
    let polling = false;
    const schedule = () => {
      if (active) timer = window.setTimeout(() => void poll(), Math.max(1000, challenge.pollAfterMs));
    };
    const poll = async () => {
      if (!active || polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const result = await api.auth.qrLoginStatus(challenge.challengeId, challenge.browserToken);
        if (!active) return;
        if (result.status === 'approved') {
          const consumed = await completeQrLogin(challenge.challengeId, challenge.browserToken);
          if (!active) return;
          challengeRef.current = null;
          setState('consumed');
          onAuthenticated(consumed.returnPath);
          return;
        }
        setState(result.status);
        if (['denied', 'expired', 'cancelled', 'consumed'].includes(result.status)) return;
      } catch (pollError) {
        if (!active) return;
        setError(pollError instanceof Error ? pollError.message : 'Не вдалося перевірити QR-вхід.');
        setState('error');
        return;
      } finally {
        polling = false;
      }
      schedule();
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !active) return;
      if (timer) window.clearTimeout(timer);
      void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [challenge, completeQrLogin, onAuthenticated, state]);

  async function showPasswordLogin() {
    await cancelChallenge();
    setChallenge(null);
    onPasswordRequested();
  }

  const statusCopy = state === 'scanned'
    ? ['QR відскановано', 'Підтвердьте вхід у застосунку MT Workspace.']
    : state === 'approved' || state === 'consumed'
      ? ['Вхід підтверджено', 'Відкриваємо ваш робочий простір…']
      : state === 'denied'
        ? ['Вхід відхилено', 'Запит відхилено в мобільному застосунку.']
        : state === 'expired'
          ? ['Термін дії QR минув', 'Створіть новий QR-код і повторіть спробу.']
          : state === 'cancelled'
            ? ['QR-вхід скасовано', 'Створіть новий QR-код або скористайтеся паролем.']
            : ['Очікуємо сканування', 'QR-код можна використати лише один раз.'];
  const isTerminal = ['denied', 'expired', 'cancelled', 'error'].includes(state);

  return <section className="qr-login" aria-label="Вхід через QR-код">
    <div className="qr-login__topline">
      <span className={`environment-badge environment-badge--${config.deployment.environment}`}>
        <span aria-hidden="true" /> {environmentLabel(config)}
      </span>
      {challenge && !isTerminal && <span className="qr-login__countdown" aria-label={`QR-код діє ще ${remainingSeconds} секунд`}>
        {countdown(remainingSeconds)}
      </span>}
    </div>

    {state === 'loading' && <div className="qr-login__loading" role="status" aria-live="polite">
      <span className="qr-login__skeleton qr-login__skeleton--code" />
      <span className="qr-login__skeleton qr-login__skeleton--line" />
      <span className="qr-login__skeleton qr-login__skeleton--short" />
      <span className="sr-only">Створюємо захищений QR-код…</span>
    </div>}

    {challenge && !isTerminal && <>
      <div className={`qr-login__code${state === 'scanned' ? ' qr-login__code--scanned' : ''}`}>
        {qrCodeDataUrl ? <img src={qrCodeDataUrl} alt="Одноразовий QR-код для входу в MT Workspace" /> : <span>Створюємо QR…</span>}
        {state === 'scanned' && <span className="qr-login__code-state" aria-hidden="true"><Icon name="check" size={26} /></span>}
      </div>
      <div className="qr-login__status" role="status" aria-live="polite">
        <strong>{statusCopy[0]}</strong>
        <span>{statusCopy[1]}</span>
      </div>
      <ol className="qr-login__steps">
        <li><span>1</span>Відкрийте MT Workspace</li>
        <li><span>2</span>Запустіть сканер і оберіть акаунт</li>
        <li><span>3</span>Підтвердьте вхід біометрією або PIN</li>
      </ol>
    </>}

    {isTerminal && <div className={`qr-login__result qr-login__result--${state}`} role={state === 'error' ? 'alert' : 'status'}>
      <span className="qr-login__result-icon"><Icon name={state === 'denied' || state === 'error' ? 'security' : 'qrCode'} size={30} /></span>
      <strong>{state === 'error' ? 'Не вдалося виконати QR-вхід' : statusCopy[0]}</strong>
      <p>{state === 'error' ? error : statusCopy[1]}</p>
      <button className="button button--primary button--wide" type="button" onClick={() => void createChallenge()}>
        <Icon name="refresh" size={17} /> Створити новий QR
      </button>
    </div>}

    <button className="button button--secondary button--wide qr-login__password" type="button" onClick={() => void showPasswordLogin()}>
      Увійти за логіном і паролем
    </button>
  </section>;
}
