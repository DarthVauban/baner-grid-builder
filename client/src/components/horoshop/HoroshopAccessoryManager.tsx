import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { HoroshopCatalogProduct, HoroshopLocalizedText } from '../../types/horoshop-catalog';
import type {
  HoroshopAccessoryCategory,
  HoroshopAccessoryDetail,
  HoroshopAccessoryLink,
  HoroshopAccessoryProduct,
  HoroshopAccessoryTarget,
  HoroshopCodexReviewProposal,
  HoroshopCodexReviewResult
} from '../../types/horoshop-accessory';

function titleFor(titles: HoroshopLocalizedText, fallback: string) {
  return titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles)[0] || fallback;
}

function productTarget(product: Omit<HoroshopAccessoryProduct, 'type'>): HoroshopAccessoryProduct {
  return { ...product, type: 'product' };
}

function categoryTarget(category: Omit<HoroshopAccessoryCategory, 'type'>): HoroshopAccessoryCategory {
  return { ...category, type: 'category' };
}

function targetKey(target: Pick<HoroshopAccessoryTarget, 'type' | 'id'>) {
  return `${target.type}:${target.id}`;
}

function formatPrice(value: string | null, currency: string | null) {
  const parsed = Number(String(value || '').replace(/\s/gu, '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  const formatted = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(parsed);
  return `${formatted} ${(currency || 'UAH').toUpperCase() === 'UAH' ? 'грн' : currency}`;
}

function ProductThumb({ product }: { product: Pick<HoroshopAccessoryProduct, 'brand' | 'imageUrl' | 'primaryImageUrl'> }) {
  const [failed, setFailed] = useState(false);
  const source = product.imageUrl || product.primaryImageUrl;
  return (
    <span className="horoshop-accessory-thumb" aria-hidden="true">
      <span>{(product.brand || 'Товар').slice(0, 2).toUpperCase()}</span>
      {source && !failed && <img src={source} alt="" onError={() => setFailed(true)} />}
    </span>
  );
}

function TargetSummary({ target }: { target: HoroshopAccessoryTarget }) {
  if (target.type === 'category') {
    return (
      <>
        <span className="horoshop-accessory-folder"><Icon name="folder" size={19} /></span>
        <span><strong>{titleFor(target.titles, target.externalId)}</strong><small>Цілий кінцевий розділ · {target.externalId}</small></span>
      </>
    );
  }
  return (
    <>
      <ProductThumb product={target} />
      <span>
        <strong>{titleFor(target.titles, target.sku)}</strong>
        <small>{target.sku}{formatPrice(target.price, target.currency) ? ` · ${formatPrice(target.price, target.currency)}` : ''} · {target.availability || 'наявність не вказана'}</small>
      </span>
    </>
  );
}

function Score({ label, value }: { label: string; value: number | null }) {
  const percent = Math.round((value || 0) * 100);
  return <span title={`${label}: ${percent}%`}><small>{label}</small><b>{percent}%</b><i><i style={{ width: `${percent}%` }} /></i></span>;
}

function SuggestionCard({ link, onAdd }: { link: HoroshopAccessoryLink; onAdd: () => void }) {
  return (
    <article className="horoshop-accessory-suggestion">
      <header><TargetSummary target={link.target} /><button type="button" onClick={onAdd}><Icon name="add" size={17} /> Додати</button></header>
      <p>{link.reason || 'Codex запропонував товар після рев’ю специфікацій каталогу.'}</p>
      <div className="horoshop-accessory-scores">
        <Score label="Сумісність" value={link.scores.compatibility} />
        <Score label="Корисність" value={link.scores.utility} />
        <Score label="Наявність" value={link.scores.availability} />
        <Score label="Популярність" value={link.scores.popularity} />
      </div>
      <footer><span>Оцінка Codex</span><strong>{Math.round((link.scores.total || 0) * 100)}%</strong></footer>
    </article>
  );
}

function mutationError(...mutations: Array<{ error: Error | null }>) {
  const failed = mutations.find((item) => item.error);
  return failed?.error?.message || null;
}

export function HoroshopAccessoryManager() {
  const queryClient = useQueryClient();
  const [targetSearchInput, setTargetSearchInput] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [draftTargets, setDraftTargets] = useState<HoroshopAccessoryTarget[]>([]);
  const [localDirty, setLocalDirty] = useState(false);
  const [candidateInput, setCandidateInput] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<HoroshopCodexReviewResult | null>(null);
  const [reviewFileError, setReviewFileError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => setTargetSearch(targetSearchInput.trim()), 250);
    return () => globalThis.clearTimeout(timeout);
  }, [targetSearchInput]);
  useEffect(() => {
    const timeout = globalThis.setTimeout(() => setCandidateSearch(candidateInput.trim()), 250);
    return () => globalThis.clearTimeout(timeout);
  }, [candidateInput]);

  const targets = useQuery({
    queryKey: ['horoshop-accessory-targets', targetSearch],
    queryFn: ({ signal }) => api.horoshopCatalog.list({ search: targetSearch, state: 'active', pageSize: 50 }, signal)
  });
  useEffect(() => {
    if (!selectedProductId && targets.data?.items[0]) setSelectedProductId(targets.data.items[0].id);
  }, [selectedProductId, targets.data]);

  const detail = useQuery({
    queryKey: ['horoshop-accessory-detail', selectedProductId],
    queryFn: ({ signal }) => api.horoshopAccessories.detail(selectedProductId!, signal),
    enabled: Boolean(selectedProductId)
  });

  const installDetail = (productId: string, value: HoroshopAccessoryDetail) => {
    queryClient.setQueryData(['horoshop-accessory-detail', productId], value);
    if (selectedProductId !== productId) return false;
    setDraftTargets(value.draft.selected.map((item) => item.target));
    setLocalDirty(false);
    return true;
  };

  useEffect(() => {
    if (!detail.data) return;
    setDraftTargets(detail.data.draft.selected.map((item) => item.target));
    setLocalDirty(false);
    setConfirmed(false);
    setFeedback(null);
  }, [detail.data, selectedProductId]);

  const candidates = useQuery({
    queryKey: ['horoshop-accessory-candidates', selectedProductId, candidateSearch],
    queryFn: ({ signal }) => api.horoshopAccessories.candidates(selectedProductId!, candidateSearch, signal),
    enabled: Boolean(selectedProductId && candidateSearch.length >= 2)
  });
  const exportReview = useMutation({
    mutationFn: () => api.horoshopAccessories.reviewCatalog(),
    onSuccess: (value) => {
      const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `horoshop-codex-review-${value.storeDomain}-${value.connectionGeneration}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setReviewFileError(null);
      setFeedback(`Каталог для Codex завантажено: ${value.products.length} товарів зі специфікаціями та модифікаціями.`);
    }
  });
  const importReview = useMutation({
    mutationFn: (document: HoroshopCodexReviewProposal) => api.horoshopAccessories.importReview(document),
    onSuccess: (value) => {
      setReviewResult(value);
      setReviewFileError(null);
      setFeedback('Пропозиції Codex імпортовано як чернетки. У Хорошоп нічого не передано.');
      if (!localDirty && selectedProductId) {
        void queryClient.invalidateQueries({ queryKey: ['horoshop-accessory-detail', selectedProductId] });
      }
    }
  });
  const saveDraft = useMutation({
    mutationFn: ({ productId, targets }: { productId: string; targets: HoroshopAccessoryTarget[] }) => api.horoshopAccessories.saveDraft(productId, targets.map(({ type, id }) => ({ type, id }))),
    onSuccess: (value, { productId }) => {
      if (!installDetail(productId, value)) return;
      setFeedback('Чернетку збережено. У Хорошоп ще нічого не передано.');
    }
  });
  const publish = useMutation({
    mutationFn: (productId: string) => api.horoshopAccessories.publish(productId),
    onSuccess: (value, productId) => {
      if (!installDetail(productId, value)) return;
      setConfirmed(false);
      setFeedback('Список аксесуарів передано в Хорошоп.');
    }
  });

  const selectedKeys = useMemo(() => new Set(draftTargets.map(targetKey)), [draftTargets]);
  const availableSuggestions = (detail.data?.draft.suggestions || []).filter((item) => !selectedKeys.has(item.key));
  const productCount = draftTargets.filter((item) => item.type === 'product').length;
  const categoryCount = draftTargets.length - productCount;
  const busy = exportReview.isPending || importReview.isPending || saveDraft.isPending || publish.isPending;

  const readReviewFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const document = JSON.parse(await file.text()) as HoroshopCodexReviewProposal;
      setReviewFileError(null);
      importReview.mutate(document);
    } catch {
      setReviewFileError('Не вдалося прочитати JSON-файл із пропозиціями Codex.');
    }
  };

  const addTarget = (target: HoroshopAccessoryTarget) => {
    if (selectedKeys.has(targetKey(target))) return;
    if (target.type === 'product' && productCount >= 16) {
      setFeedback('Досягнуто ліміт — 16 конкретних товарів.');
      return;
    }
    if (target.type === 'category' && categoryCount >= 16) {
      setFeedback('Досягнуто ліміт — 16 розділів.');
      return;
    }
    setDraftTargets((current) => [...current, target]);
    setLocalDirty(true);
    setConfirmed(false);
    setFeedback(null);
  };
  const removeTarget = (target: HoroshopAccessoryTarget) => {
    setDraftTargets((current) => current.filter((item) => targetKey(item) !== targetKey(target)));
    setLocalDirty(true);
    setConfirmed(false);
    setFeedback(null);
  };
  const chooseProduct = (product: HoroshopCatalogProduct) => {
    setSelectedProductId(product.id);
    setCandidateInput('');
    setCandidateSearch('');
  };

  return (
    <section className="horoshop-accessory-manager">
      <section className="horoshop-accessory-bulk">
        <div>
          <span className="horoshop-accessory-bulk-icon"><Icon name="productSelection" size={23} /></span>
          <span><h2>Рев’ю каталогу через Codex</h2><p>Завантажте актуальний каталог, передайте файл у чат Codex і попросіть логічно підібрати супутні товари. Застосунок не використовує жодного вбудованого алгоритму.</p></span>
        </div>
        <div className="horoshop-accessory-bulk-actions">
          <button className="button button--primary" type="button" disabled={busy} onClick={() => exportReview.mutate()}><Icon name="download" size={18} />{exportReview.isPending ? 'Готуємо каталог…' : 'Завантажити каталог для Codex'}</button>
          <label className="button button--secondary" aria-disabled={busy || localDirty}>
            <Icon name="upload" size={18} />{importReview.isPending ? 'Імпортуємо…' : 'Імпортувати пропозиції Codex'}
            <input
              hidden
              type="file"
              accept="application/json,.json"
              aria-label="Імпортувати пропозиції Codex"
              disabled={busy || localDirty}
              onChange={(event) => {
                void readReviewFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        <small>Codex може також отримати каталог і записати рев’ю напряму через API цього інструмента. Усі пропозиції спочатку потрапляють у чернетку.</small>
        {localDirty && <small>Збережіть поточну чернетку перед імпортом нового рев’ю.</small>}
        {(exportReview.isError || importReview.isError || reviewFileError) && <div className="horoshop-accessory-message is-error"><Icon name="alarm" size={18} />{reviewFileError || exportReview.error?.message || importReview.error?.message}</div>}
        {reviewResult && (
          <div className="horoshop-accessory-bulk-result">
            <span><small>Переглянуто</small><strong>{reviewResult.reviewedProducts}</strong></span>
            <span><small>З пропозиціями</small><strong>{reviewResult.productsWithRecommendations}</strong></span>
            <span><small>Без пропозицій</small><strong>{reviewResult.productsWithoutRecommendations}</strong></span>
            <span><small>Пропозицій у рев’ю</small><strong>{reviewResult.recommendationsSaved}</strong></span>
          </div>
        )}
      </section>

      <aside className="horoshop-accessory-targets">
        <header><span><strong>Товар для налаштування</strong><small>Оберіть батьківську картку</small></span><b>{targets.data?.total || 0}</b></header>
        <label className="horoshop-accessory-search"><Icon name="search" size={18} /><input aria-label="Пошук товару для налаштування" value={targetSearchInput} onChange={(event) => setTargetSearchInput(event.target.value)} placeholder="Назва або артикул" /></label>
        <div className="horoshop-accessory-target-list" aria-busy={targets.isFetching}>
          {targets.data?.items.map((product) => (
            <button type="button" className={selectedProductId === product.id ? 'is-active' : ''} onClick={() => chooseProduct(product)} key={product.id}>
              <ProductThumb product={{ brand: product.brand, primaryImageUrl: product.primaryImageUrl }} />
              <span><strong>{titleFor(product.titles, product.sku)}</strong><small>{product.sku} · {product.availability || 'наявність не вказана'}</small></span>
              <Icon name="chevronRight" size={17} />
            </button>
          ))}
          {targets.isLoading && <p>Завантажуємо товари…</p>}
          {!targets.isLoading && targets.data?.items.length === 0 && <p>Товарів не знайдено.</p>}
        </div>
      </aside>

      <div className="horoshop-accessory-workspace">
        {!selectedProductId && <div className="horoshop-accessory-empty"><Icon name="productSelection" size={30} /><strong>Оберіть товар</strong><span>Після цього з’являться чернетка та рекомендації.</span></div>}
        {detail.isLoading && <div className="horoshop-accessory-empty"><span className="loading-screen__pulse" /><strong>Готуємо робочу область…</strong></div>}
        {detail.isError && <div className="horoshop-accessory-empty is-error"><Icon name="alarm" size={28} /><strong>Не вдалося відкрити товар</strong><span>{detail.error.message}</span></div>}
        {detail.data && (
          <>
            <header className="horoshop-accessory-heading">
              <div><span className="eyebrow">Аксесуари для</span><h2>{titleFor(detail.data.product.titles, detail.data.product.sku)}</h2><p><code>{detail.data.product.sku}</code> · {detail.data.product.brand || 'без бренду'}</p></div>
            </header>

            {!detail.data.draft.catalogStateKnown && (
              <div className="horoshop-accessory-warning"><Icon name="alarm" size={19} /><span><strong>Поточний список аксесуарів не повернувся з експорту.</strong>Публікація замінить весь список у картці цим проєктом.</span></div>
            )}
            {mutationError(saveDraft, publish) && <div className="horoshop-accessory-message is-error"><Icon name="alarm" size={18} />{mutationError(saveDraft, publish)}</div>}
            {feedback && <div className="horoshop-accessory-message"><Icon name="check" size={18} />{feedback}</div>}

            <section className="horoshop-accessory-section">
              <header><span><h3>Чернетка списку</h3><p>Конкретні товари: {productCount}/16 · Розділи: {categoryCount}/16</p></span>{(localDirty || detail.data.draft.isDirty) && <b>Є неопубліковані зміни</b>}</header>
              <div className="horoshop-accessory-selected-list">
                {draftTargets.map((target) => (
                  <article key={targetKey(target)}><TargetSummary target={target} /><button type="button" aria-label={`Видалити ${target.type === 'product' ? titleFor(target.titles, target.sku) : titleFor(target.titles, target.externalId)}`} onClick={() => removeTarget(target)}><Icon name="close" size={17} /></button></article>
                ))}
                {draftTargets.length === 0 && <div className="horoshop-accessory-list-empty"><strong>Список порожній</strong><span>Додайте аксесуари з рекомендацій або через пошук.</span></div>}
              </div>
              <div className="horoshop-accessory-manual-search">
                <label><Icon name="search" size={18} /><input aria-label="Пошук аксесуарів або розділів" value={candidateInput} onChange={(event) => setCandidateInput(event.target.value)} placeholder="Додати вручну: товар або кінцевий розділ" /></label>
                {candidateSearch.length >= 2 && (
                  <div className="horoshop-accessory-search-results">
                    {candidates.isFetching && <p>Шукаємо…</p>}
                    {!candidates.isFetching && candidates.data?.products.filter((item) => !selectedKeys.has(`product:${item.id}`)).map((item) => <button type="button" key={item.id} onClick={() => addTarget(productTarget(item))}><TargetSummary target={productTarget(item)} /><Icon name="add" size={17} /></button>)}
                    {!candidates.isFetching && candidates.data?.categories.filter((item) => !selectedKeys.has(`category:${item.id}`)).map((item) => <button type="button" key={item.id} onClick={() => addTarget(categoryTarget(item))}><TargetSummary target={categoryTarget(item)} /><Icon name="add" size={17} /></button>)}
                    {!candidates.isFetching && candidates.data && candidates.data.products.length + candidates.data.categories.length === 0 && <p>Нічого не знайдено.</p>}
                  </div>
                )}
              </div>
              <footer><button className="button button--secondary" type="button" disabled={!localDirty || busy} onClick={() => saveDraft.mutate({ productId: selectedProductId!, targets: draftTargets })}><Icon name="save" size={18} />{saveDraft.isPending ? 'Зберігаємо…' : 'Зберегти чернетку'}</button></footer>
            </section>

            <section className="horoshop-accessory-section">
              <header><span><h3>Пропозиції Codex</h3><p>Оцінки виставлені Codex під час змістовного рев’ю, а не розраховані алгоритмом.</p></span><b>{availableSuggestions.length} кандидатів</b></header>
              <div className="horoshop-accessory-suggestions">
                {availableSuggestions.map((item) => <SuggestionCard link={item} key={item.key} onAdd={() => addTarget(item.target)} />)}
                {availableSuggestions.length === 0 && <div className="horoshop-accessory-list-empty"><strong>Немає пропозицій Codex</strong><span>Товар міг бути свідомо залишений без супутніх товарів або ще не входив до рев’ю.</span></div>}
              </div>
            </section>

            <section className="horoshop-accessory-publish">
              <div><span className="horoshop-accessory-publish-icon"><Icon name="send" size={23} /></span><span><h3>Передати в Хорошоп</h3><p>Буде оновлено поле «Аксесуари» батьківської картки. Модифікації доступні Codex під час рев’ю, але не публікуються окремо.</p></span></div>
              {detail.data.latestPublication && <p className={`horoshop-accessory-publication is-${detail.data.latestPublication.status}`}><strong>{detail.data.latestPublication.status === 'succeeded' ? 'Остання публікація успішна' : detail.data.latestPublication.status === 'failed' ? 'Остання публікація невдала' : 'Публікація виконується'}</strong><span>{new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(detail.data.latestPublication.startedAt))}</span></p>}
              <label className="horoshop-accessory-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Я розумію, що цей список перезапише поточні аксесуари товару в Хорошоп.</strong><small>Публікується лише остання збережена чернетка.</small></span></label>
              <button className="button button--primary" type="button" disabled={!confirmed || localDirty || busy} onClick={() => publish.mutate(selectedProductId!)}><Icon name="send" size={18} />{publish.isPending ? 'Передаємо…' : 'Передати в Хорошоп'}</button>
              {localDirty && <small className="horoshop-accessory-publish-hint">Спочатку збережіть зміни в чернетці.</small>}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
