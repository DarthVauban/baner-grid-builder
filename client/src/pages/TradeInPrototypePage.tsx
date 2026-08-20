import { FormEvent, useMemo, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';

type TradeInCategory = 'smartphone' | 'apple' | 'laptop';
type AnswerValue = string | string[] | boolean;
type Answers = Record<string, AnswerValue>;

interface Choice {
  value: string;
  label: string;
  description?: string;
}

interface CategoryChoice {
  id: TradeInCategory;
  label: string;
  description: string;
  icon: IconName;
}

const categories: CategoryChoice[] = [
  { id: 'smartphone', label: 'Смартфон', description: 'Android та інші смартфони', icon: 'android' },
  { id: 'apple', label: 'Смартфон Apple', description: 'Окремий сценарій для iPhone', icon: 'apple' },
  { id: 'laptop', label: 'Ноутбук', description: 'Ноутбуки різних брендів', icon: 'productTables' }
];

const stepLabels = ['Категорія', 'Пристрій', 'Стан', 'Контакти'];

const operationOptions: Choice[] = [
  { value: 'exchange', label: 'Обміняти', description: 'Використати вартість для нової покупки' },
  { value: 'sell', label: 'Продати', description: 'Отримати пропозицію від менеджера' }
];

const memoryOptions = ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'];
const yesNoOptions: Choice[] = [
  { value: 'yes', label: 'Так' },
  { value: 'no', label: 'Ні' }
];

const labelByValue: Record<string, string> = {
  smartphone: 'Смартфон',
  apple: 'Смартфон Apple',
  laptop: 'Ноутбук',
  exchange: 'Обміняти на інший товар',
  sell: 'Продати пристрій',
  physical: 'Фізична SIM',
  esim: 'eSIM',
  both: 'Фізична SIM + eSIM',
  worn: 'Затертий',
  normal: 'Нормальний',
  ideal: 'Ідеальний',
  broken: 'Розбитий',
  scratched: 'Є подряпини',
  weak: 'Слабкий',
  yes: 'Так',
  no: 'Ні',
  body: 'Корпус',
  display: 'Дисплей',
  keyboard: 'Клавіатура',
  none: 'Дефектів немає'
};

function ChoiceGroup({
  name,
  label,
  value,
  options,
  onChange
}: {
  name: string;
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="trade-in-choice-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label className={value === option.value ? 'is-selected' : ''} key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
            <Icon name="check" size={16} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function answerText(value: AnswerValue | undefined) {
  if (Array.isArray(value)) return value.map((item) => labelByValue[item] || item).join(', ');
  if (typeof value === 'boolean') return value ? 'Так' : 'Ні';
  return labelByValue[String(value || '')] || String(value || '');
}

export function TradeInPrototypePage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState(false);

  const category = String(answers.category || '') as TradeInCategory | '';
  const selectedCategory = categories.find((item) => item.id === category);

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function selectCategory(value: TradeInCategory) {
    setAnswers({ category: value });
  }

  function toggleDefect(value: string, checked: boolean) {
    const current = Array.isArray(answers.defects) ? answers.defects : [];
    if (!checked) {
      setAnswer('defects', current.filter((item) => item !== value));
      return;
    }
    setAnswer('defects', value === 'none'
      ? ['none']
      : [...current.filter((item) => item !== 'none' && item !== value), value]);
  }

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(category);
    if (step === 1) {
      if (!answers.operation || !answers.model) return false;
      if (category === 'smartphone') return Boolean(answers.brand && answers.memory);
      if (category === 'apple') return Boolean(answers.memory && answers.simType);
      if (category === 'laptop') return Boolean(answers.brand);
      return false;
    }
    if (step === 2) {
      if (category === 'smartphone') return Boolean(answers.deviceCondition && answers.screenCondition);
      if (category === 'apple') return Boolean(
        answers.deviceCondition
        && answers.screenCondition
        && Number(answers.batteryHealth) > 0
        && Number(answers.batteryHealth) <= 100
      );
      if (category === 'laptop') return Boolean(
        answers.charger
        && answers.box
        && answers.documents
        && Array.isArray(answers.defects)
        && answers.defects.length
        && answers.batteryCondition
        && answers.osInstalled
      );
      return false;
    }
    const phoneDigits = String(answers.phone || '').replace(/\D/g, '');
    return Boolean(
      String(answers.firstName || '').trim()
      && phoneDigits.length >= 10
      && answers.consent === true
    );
  }, [answers, category, step]);

  const summaryRows = useMemo(() => {
    const rows: Array<[string, AnswerValue | undefined]> = [
      ['Категорія', answers.category],
      ['Формат', answers.operation],
      ['Бренд', category === 'apple' ? 'Apple' : answers.brand],
      ['Модель', answers.model]
    ];
    if (category !== 'laptop') rows.push(['Памʼять', answers.memory]);
    if (category === 'apple') {
      rows.push(['Тип SIM', answers.simType]);
      rows.push(['Стан АКБ', answers.batteryHealth ? `${answers.batteryHealth}%` : '']);
    }
    if (category === 'smartphone' || category === 'apple') {
      rows.push(['Стан пристрою', answers.deviceCondition]);
      rows.push(['Стан екрана', answers.screenCondition]);
    }
    if (category === 'laptop') {
      rows.push(['Зарядка', answers.charger]);
      rows.push(['Коробка', answers.box]);
      rows.push(['Документи', answers.documents]);
      rows.push(['Дефекти', answers.defects]);
      rows.push(['Стан АКБ', answers.batteryCondition]);
      rows.push([answers.brand === 'Apple' ? 'Встановлена macOS' : 'Встановлений Windows', answers.osInstalled]);
    }
    return rows.filter(([, value]) => answerText(value));
  }, [answers, category]);

  function submitStep(event: FormEvent) {
    event.preventDefault();
    if (!canContinue) return;
    if (step < stepLabels.length - 1) {
      setStep((current) => current + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setDone(true);
  }

  function resetPrototype() {
    setAnswers({});
    setStep(0);
    setDone(false);
  }

  if (done) {
    return (
      <div className="trade-in-page">
        <div className="trade-in-prototype-note" role="note">
          <Icon name="edit" size={16} />
          Тестовий режим: заявка не була збережена або надіслана менеджеру.
        </div>
        <section className="trade-in-success">
          <span><Icon name="check" size={32} /></span>
          <p className="eyebrow">Прототип завершено</p>
          <h1>Дякуємо, {String(answers.firstName)}!</h1>
          <p>
            У робочій версії на цьому етапі буде створена Trade-in заявка, а менеджер Mobile Trend
            отримає відповіді та звʼяжеться з клієнтом.
          </p>
          <div className="trade-in-success__summary">
            <strong>{selectedCategory?.label}</strong>
            <span>{String(category === 'apple' ? 'Apple' : answers.brand || '')} {String(answers.model || '')}</span>
          </div>
          <button className="button button--primary" type="button" onClick={resetPrototype}>
            Пройти форму ще раз
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="trade-in-page trade-in-prototype-page">
      <div className="trade-in-prototype-note" role="note">
        <Icon name="edit" size={16} />
        Тестовий режим: дані з цієї форми нікуди не надсилаються.
      </div>

      <header className="trade-in-page-heading">
        <div>
          <p className="eyebrow">Прототип анкети</p>
          <h1>Попередня оцінка пристрою</h1>
          <p>Оберіть тестовий сценарій і пройдіть усі кроки анкети.</p>
        </div>
        <span>Крок {step + 1} з {stepLabels.length}</span>
      </header>

      <ol className="trade-in-progress" aria-label="Кроки анкети">
        {stepLabels.map((label, index) => (
          <li className={index === step ? 'is-active' : index < step ? 'is-complete' : ''} key={label}>
            <button type="button" disabled={index > step} onClick={() => index < step && setStep(index)}>
              <span>{index < step ? <Icon name="check" size={15} /> : index + 1}</span>
              <strong>{label}</strong>
            </button>
          </li>
        ))}
      </ol>

      <form className="trade-in-wizard" onSubmit={submitStep}>
        <div className="trade-in-wizard__body">
          {step === 0 && (
            <section className="trade-in-step">
              <header>
                <span>01</span>
                <div><h2>Що будемо оцінювати?</h2><p>Для першого каркаса доступні три тестові сценарії.</p></div>
              </header>
              <div className="trade-in-category-grid">
                {categories.map((item) => (
                  <button
                    className={category === item.id ? 'is-selected' : ''}
                    type="button"
                    onClick={() => selectCategory(item.id)}
                    aria-pressed={category === item.id}
                    key={item.id}
                  >
                    <span><Icon name={item.icon} size={29} /></span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                    <i><Icon name="check" size={15} /></i>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="trade-in-step">
              <header>
                <span>02</span>
                <div><h2>Розкажіть про пристрій</h2><p>{selectedCategory?.label}: базові характеристики для попередньої оцінки.</p></div>
              </header>

              <ChoiceGroup
                name="operation"
                label="Що ви хочете зробити?"
                value={String(answers.operation || '')}
                options={operationOptions}
                onChange={(value) => setAnswer('operation', value)}
              />

              <div className="trade-in-field-grid">
                {category === 'smartphone' && (
                  <label className="field">
                    <span>Бренд</span>
                    <StyledSelect value={String(answers.brand || '')} options={[{ value: '', label: 'Оберіть бренд' }, ...['Samsung', 'Xiaomi', 'Google', 'Motorola', 'OnePlus', 'Інший'].map((brand) => ({ value: brand, label: brand }))]} onChange={(value) => setAnswer('brand', value)} ariaLabel="Бренд смартфона" />
                  </label>
                )}

                {category === 'laptop' && (
                  <label className="field">
                    <span>Бренд</span>
                    <StyledSelect value={String(answers.brand || '')} options={[{ value: '', label: 'Оберіть бренд' }, ...['Apple', 'Lenovo', 'HP', 'ASUS', 'Acer', 'Dell', 'Інший'].map((brand) => ({ value: brand, label: brand }))]} onChange={(value) => setAnswer('brand', value)} ariaLabel="Бренд ноутбука" />
                  </label>
                )}

                <label className="field">
                  <span>Модель</span>
                  {category === 'apple' ? (
                    <StyledSelect value={String(answers.model || '')} options={[{ value: '', label: 'Оберіть модель' }, ...['iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 16', 'Інша модель'].map((model) => ({ value: model, label: model }))]} onChange={(value) => setAnswer('model', value)} ariaLabel="Модель смартфона" />
                  ) : (
                    <input
                      value={String(answers.model || '')}
                      onChange={(event) => setAnswer('model', event.target.value)}
                      placeholder={category === 'laptop' ? 'Наприклад, IdeaPad 5 15IAL7' : 'Наприклад, Galaxy S24'}
                    />
                  )}
                </label>

                {category !== 'laptop' && (
                  <label className="field">
                    <span>Обсяг памʼяті</span>
                    <StyledSelect value={String(answers.memory || '')} options={[{ value: '', label: 'Оберіть памʼять' }, ...memoryOptions.map((memory) => ({ value: memory, label: memory }))]} onChange={(value) => setAnswer('memory', value)} ariaLabel="Обсяг памʼяті" />
                  </label>
                )}
              </div>

              {category === 'apple' && (
                <ChoiceGroup
                  name="simType"
                  label="Тип SIM"
                  value={String(answers.simType || '')}
                  options={[
                    { value: 'physical', label: 'Фізична SIM' },
                    { value: 'esim', label: 'eSIM' },
                    { value: 'both', label: 'Фізична SIM + eSIM' }
                  ]}
                  onChange={(value) => setAnswer('simType', value)}
                />
              )}
            </section>
          )}

          {step === 2 && (
            <section className="trade-in-step">
              <header>
                <span>03</span>
                <div><h2>Стан і комплектація</h2><p>Відповіді не формують ціну автоматично — це дані для менеджера.</p></div>
              </header>

              {(category === 'smartphone' || category === 'apple') && (
                <>
                  <ChoiceGroup
                    name="deviceCondition"
                    label="Загальний стан пристрою"
                    value={String(answers.deviceCondition || '')}
                    options={[
                      { value: 'worn', label: 'Затертий' },
                      { value: 'normal', label: 'Нормальний' },
                      { value: 'ideal', label: 'Ідеальний' }
                    ]}
                    onChange={(value) => setAnswer('deviceCondition', value)}
                  />
                  <ChoiceGroup
                    name="screenCondition"
                    label="Стан екрана"
                    value={String(answers.screenCondition || '')}
                    options={[
                      { value: 'broken', label: 'Розбитий' },
                      { value: 'scratched', label: 'Є подряпини' },
                      { value: 'ideal', label: 'Ідеальний' }
                    ]}
                    onChange={(value) => setAnswer('screenCondition', value)}
                  />
                  {category === 'apple' && (
                    <label className="field trade-in-battery-field">
                      <span>Стан АКБ, %</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={String(answers.batteryHealth || '')}
                        onChange={(event) => setAnswer('batteryHealth', event.target.value)}
                        placeholder="Наприклад, 87"
                      />
                      <small>Значення Battery Health у налаштуваннях iPhone</small>
                    </label>
                  )}
                </>
              )}

              {category === 'laptop' && (
                <>
                  <div className="trade-in-accessory-grid">
                    <ChoiceGroup name="charger" label="Є зарядка?" value={String(answers.charger || '')} options={yesNoOptions} onChange={(value) => setAnswer('charger', value)} />
                    <ChoiceGroup name="box" label="Є коробка?" value={String(answers.box || '')} options={yesNoOptions} onChange={(value) => setAnswer('box', value)} />
                    <ChoiceGroup name="documents" label="Є документи?" value={String(answers.documents || '')} options={yesNoOptions} onChange={(value) => setAnswer('documents', value)} />
                  </div>

                  <fieldset className="trade-in-defects">
                    <legend>Дефекти ноутбука</legend>
                    <div>
                      {[
                        { value: 'body', label: 'Корпус' },
                        { value: 'display', label: 'Дисплей' },
                        { value: 'keyboard', label: 'Клавіатура' },
                        { value: 'none', label: 'Дефектів немає' }
                      ].map((option) => {
                        const checked = Array.isArray(answers.defects) && answers.defects.includes(option.value);
                        return (
                          <label className={checked ? 'is-selected' : ''} key={option.value}>
                            <input type="checkbox" checked={checked} onChange={(event) => toggleDefect(option.value, event.target.checked)} />
                            <span>{option.label}</span>
                            <Icon name="check" size={15} />
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <ChoiceGroup
                    name="batteryCondition"
                    label="Стан АКБ"
                    value={String(answers.batteryCondition || '')}
                    options={[
                      { value: 'weak', label: 'Слабкий' },
                      { value: 'normal', label: 'Нормальний' },
                      { value: 'ideal', label: 'Ідеальний' }
                    ]}
                    onChange={(value) => setAnswer('batteryCondition', value)}
                  />
                  <ChoiceGroup
                    name="osInstalled"
                    label={answers.brand === 'Apple' ? 'Встановлена macOS?' : 'Встановлений Windows?'}
                    value={String(answers.osInstalled || '')}
                    options={yesNoOptions}
                    onChange={(value) => setAnswer('osInstalled', value)}
                  />
                </>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="trade-in-step">
              <header>
                <span>04</span>
                <div><h2>Контакти й підсумок</h2><p>У робочій версії менеджер використає ці дані, щоб звʼязатися з клієнтом.</p></div>
              </header>

              <div className="trade-in-contact-layout">
                <div className="trade-in-contact-fields">
                  <label className="field">
                    <span>Імʼя</span>
                    <input value={String(answers.firstName || '')} onChange={(event) => setAnswer('firstName', event.target.value)} placeholder="Як до вас звертатися" />
                  </label>
                  <label className="field">
                    <span>Номер телефону</span>
                    <input type="tel" value={String(answers.phone || '')} onChange={(event) => setAnswer('phone', event.target.value)} placeholder="+380 (__) ___-__-__" />
                  </label>
                  <label className="field">
                    <span>Коментар <small>необовʼязково</small></span>
                    <textarea value={String(answers.comment || '')} onChange={(event) => setAnswer('comment', event.target.value)} placeholder="Що ще варто знати менеджеру?" />
                  </label>
                  <label className="trade-in-consent">
                    <input type="checkbox" checked={answers.consent === true} onChange={(event) => setAnswer('consent', event.target.checked)} />
                    <span>Погоджуюся на обробку контактних даних для зворотного звʼязку щодо Trade-in.</span>
                  </label>
                </div>

                <aside className="trade-in-summary">
                  <p className="eyebrow">Ваш пристрій</p>
                  <h3>{selectedCategory?.label}</h3>
                  <dl>
                    {summaryRows.map(([label, value]) => (
                      <div key={label}><dt>{label}</dt><dd>{answerText(value)}</dd></div>
                    ))}
                  </dl>
                </aside>
              </div>
            </section>
          )}
        </div>

        <footer className="trade-in-wizard__footer">
          <button className="button button--secondary" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            <Icon name="arrowLeft" size={16} /> Назад
          </button>
          <span>{canContinue ? 'Можна продовжувати' : 'Заповніть обовʼязкові поля'}</span>
          <button className="button button--primary" type="submit" disabled={!canContinue}>
            {step === stepLabels.length - 1 ? 'Завершити прототип' : 'Далі'} <Icon name="arrowRight" size={16} />
          </button>
        </footer>
      </form>
    </div>
  );
}
