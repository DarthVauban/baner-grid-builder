import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

const processSteps = [
  {
    number: '01',
    title: 'Клієнт описує пристрій',
    text: 'Обирає категорію, модель, комплектацію та чесно відповідає на запитання про стан техніки.'
  },
  {
    number: '02',
    title: 'Менеджер отримує заявку',
    text: 'У наступній версії анкета створюватиме окрему Trade-in заявку з усіма відповідями клієнта.'
  },
  {
    number: '03',
    title: 'Фінальна оцінка після перевірки',
    text: 'Попередня анкета допомагає підготуватися, а остаточна вартість визначається після діагностики.'
  }
];

export function TradeInOverviewPage() {
  return (
    <div className="trade-in-page trade-in-overview-page">
      <div className="trade-in-draft-note" role="note">
        <Icon name="edit" size={16} />
        <span><strong>Чернетка розділу.</strong> Тексти, структура й загальний дизайн ще будуть змінюватися.</span>
      </div>

      <section className="trade-in-hero">
        <div className="trade-in-hero__copy">
          <p className="eyebrow">Trade-in у Mobile Trend</p>
          <h1>Стара техніка може стати частиною нової покупки</h1>
          <p>
            Розкажіть про свій пристрій у короткій покроковій анкеті. Ми передамо інформацію менеджеру,
            щоб він підготував попередню оцінку та пояснив наступні кроки.
          </p>
          <div className="trade-in-hero__actions">
            <Link className="button button--primary" to="/trade-in/editor">
              Відкрити конструктор <Icon name="arrowRight" size={17} />
            </Link>
            <span>Сторінка та форма зберігаються як окрема чернетка</span>
          </div>
        </div>

        <div className="trade-in-hero__visual" aria-hidden="true">
          <span className="trade-in-hero__device trade-in-hero__device--back" />
          <span className="trade-in-hero__device trade-in-hero__device--front">
            <Icon name="tradeIn" size={34} />
          </span>
          <span className="trade-in-hero__badge">Нова покупка</span>
        </div>
      </section>

      <section className="trade-in-facts" aria-label="Mobile Trend у цифрах">
        <article><strong>15+</strong><span>років на українському ринку</span></article>
        <article><strong>114+</strong><span>магазинів мережі</span></article>
        <article><strong>21</strong><span>область України</span></article>
      </section>

      <section className="trade-in-section">
        <header>
          <p className="eyebrow">Майбутній сценарій</p>
          <h2>Як працюватиме Trade-in</h2>
        </header>
        <div className="trade-in-process">
          {processSteps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trade-in-status-card">
        <div>
          <p className="eyebrow">Поточний етап</p>
          <h2>Що входить у цей каркас</h2>
        </div>
        <ul>
          <li><Icon name="check" size={17} /> Окремий розділ і навігація Trade-in</li>
          <li><Icon name="check" size={17} /> Конструктор секцій публічної сторінки</li>
          <li><Icon name="check" size={17} /> Окремий редактор кроків, полів і умов форми</li>
          <li><Icon name="check" size={17} /> Публікація на піддомені та передача заявок менеджеру</li>
        </ul>
      </section>
    </div>
  );
}
