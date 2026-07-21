import { useAuth } from '../auth/AuthContext';

export function ServiceUnavailableScreen() {
  const { refreshUser } = useAuth();

  return (
    <main className="service-unavailable" role="alert">
      <div className="service-unavailable__mark">MT</div>
      <h1>Сервіс тимчасово недоступний</h1>
      <p>Не вдалося з’єднатися із сервером. Ваша сесія збережена — спробуйте ще раз за хвилину.</p>
      <button
        className="button button--primary"
        type="button"
        onClick={() => void refreshUser().catch(() => undefined)}
      >
        Повторити
      </button>
    </main>
  );
}
