import { expect, test, type Locator, type Page } from '@playwright/test';

const admin = {
  email: 'e2e-admin@test.local',
  password: 'E2E-admin-password-2026'
};

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
}

async function selectEditorText(editor: Locator, query?: string) {
  await editor.evaluate((element, selector) => {
    const target = selector ? element.querySelector(selector) : element;
    const text = target?.firstChild;
    if (!text) throw new Error('Text node for selection was not found.');
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, query);
}

async function selectStyledOption(page: Page, trigger: Locator, optionName: string) {
  await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  await trigger.click();
  const option = page.getByRole('option', { name: optionName, exact: true });
  await expect(option).toBeVisible();
  await option.click();
}

test('rich text editor formats content, preserves pasted links and configures link plaques', async ({ page }) => {
  await login(page);
  const created = await page.request.post('/api/publications', {
    data: {
      title: 'Rich text article',
      description: 'Виділений текст',
      publishAt: new Date(Date.now() + 86_400_000).toISOString(),
      assigneeId: null,
      materials: []
    }
  });
  expect(created.ok()).toBe(true);
  const publication = (await created.json()).data as { id: string };

  await page.goto(`/tools/blog-publications/${publication.id}/editor`);
  await expect(page.getByRole('heading', { name: 'Rich text article' })).toBeVisible();

  const editors = page.locator('.blog-rich-text-field__editor');
  const leadEditor = editors.first();
  const leadField = leadEditor.locator('xpath=../..');
  await expect(leadEditor).toContainText('Виділений текст');
  const [toolHeight, blockSelectHeight, fontSizeHeight] = await Promise.all([
    leadField.getByRole('button', { name: 'Жирний текст' }).evaluate((element) => getComputedStyle(element).height),
    leadField.getByRole('button', { name: 'Тип текстового блока' }).evaluate((element) => getComputedStyle(element).height),
    leadField.getByRole('group', { name: 'Керування розміром шрифту' }).evaluate((element) => getComputedStyle(element).height)
  ]);
  expect(blockSelectHeight).toBe(toolHeight);
  expect(fontSizeHeight).toBe(toolHeight);
  await selectEditorText(leadEditor);
  await leadField.getByRole('button', { name: 'Додати або змінити посилання' }).click();
  await expect(page.getByRole('heading', { name: 'Додати посилання' })).toBeVisible();
  const linkFooterPadding = await page.locator('.blog-link-dialog .modal__footer').evaluate((element) => ({
    bottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
    left: Number.parseFloat(getComputedStyle(element).paddingLeft),
    right: Number.parseFloat(getComputedStyle(element).paddingRight)
  }));
  expect(linkFooterPadding.bottom).toBeGreaterThanOrEqual(18);
  expect(linkFooterPadding.left).toBeGreaterThanOrEqual(20);
  expect(linkFooterPadding.right).toBeGreaterThanOrEqual(20);
  await expect(page.getByLabel('Текст посилання')).toHaveValue('Виділений текст');
  await page.getByLabel('Посилання', { exact: true }).fill('example.com/phone');
  await page.locator('.blog-link-dialog').getByRole('button', { name: 'Додати посилання', exact: true }).click();

  const preview = page.frameLocator('iframe[title="Попередній перегляд статті"]');
  await expect(preview.locator('.mt-blog-lead a')).toHaveText('Виділений текст');
  await expect(preview.locator('.mt-blog-lead a')).toHaveAttribute('href', 'https://example.com/phone');

  const paragraphEditor = editors.nth(1);
  const paragraphField = paragraphEditor.locator('xpath=../..');
  await selectEditorText(paragraphEditor);
  await paragraphField.getByRole('button', { name: 'Жирний текст' }).click();
  await expect(preview.locator('.mt-blog-text strong')).toContainText('Виділений текст');
  await selectEditorText(paragraphEditor);
  await paragraphField.getByRole('button', { name: 'Курсив' }).click();
  await expect(preview.locator('.mt-blog-text em')).toContainText('Виділений текст');

  await paragraphEditor.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const clipboard = new DataTransfer();
    const filler = Array.from({ length: 36 }, (_, index) => `<p>Додатковий рядок ${index + 1} для перевірки прокрутки.</p>`).join('');
    clipboard.setData('text/html', `<p><strong>Форматований</strong> <em>текст</em> з <a href="https://example.com/catalog" onclick="alert(1)">посиланням</a><script>alert(2)</script></p>${filler}`);
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  await expect(paragraphEditor.locator('strong')).toHaveText('Форматований');
  await expect(paragraphEditor.locator('a')).toHaveAttribute('href', 'https://example.com/catalog');
  await expect(paragraphEditor.locator('script')).toHaveCount(0);
  await expect(preview.locator('.mt-blog-text a')).toHaveText('посиланням');

  const previewDocument = preview.locator('html');
  await expect.poll(() => previewDocument.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const previewScroll = await previewDocument.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(previewScroll).toBeGreaterThan(0);
  await paragraphEditor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Оновлено');
  await expect.poll(() => previewDocument.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(previewScroll - 2);

  await selectEditorText(paragraphEditor, 'strong');
  const fontSize = paragraphField.getByRole('spinbutton', { name: 'Розмір шрифту' });
  await fontSize.fill('24');
  await fontSize.press('Enter');
  await expect(preview.locator('.mt-blog-text span[style="font-size:24px"]')).toContainText('Форматований');

  await paragraphEditor.click();
  await page.keyboard.press('End');
  await paragraphField.getByRole('button', { name: 'Вставити таблицю 3 на 3' }).click();
  await expect(paragraphEditor.locator('table')).toBeVisible();
  await expect(paragraphField.getByRole('toolbar', { name: 'Керування таблицею' })).toBeVisible();
  await expect(preview.locator('.mt-blog-table')).toBeVisible();

  const linkStyleSelect = page.getByRole('button', { name: 'Готовий стиль посилань', exact: true });
  const bodyFontSelect = page.getByRole('button', { name: 'Базовий розмір тексту', exact: true });
  await selectStyledOption(page, linkStyleSelect, 'Жовта плашка / чорний текст');
  await selectStyledOption(page, bodyFontSelect, '20 px');
  await expect.poll(() => preview.locator('.mt-blog-text').evaluate((element) => getComputedStyle(element).fontSize)).toBe('20px');
  await expect.poll(() => preview.locator('.mt-blog-text a').evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color
  }))).toEqual({ background: 'rgb(255, 225, 1)', color: 'rgb(0, 0, 0)' });

  const saveButton = page.getByRole('button', { name: 'Зберегти', exact: true });
  await saveButton.click();
  await expect(saveButton).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Rich text article' })).toBeVisible();
  await expect(editors.nth(1).locator('table')).toBeVisible();
  await expect(preview.locator('.mt-blog-table')).toBeVisible();
  await expect(linkStyleSelect.locator('span')).toHaveText('Жовта плашка / чорний текст');
  await expect(bodyFontSelect.locator('span')).toHaveText('20 px');

  await page.request.patch(`/api/publications/${publication.id}/status`, {
    data: { status: 'cancelled', publicationUrl: '' }
  });
});
