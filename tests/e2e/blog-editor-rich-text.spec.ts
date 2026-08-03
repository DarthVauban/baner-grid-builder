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
  const leadField = leadEditor.locator('..');
  await expect(leadEditor).toContainText('Виділений текст');
  await selectEditorText(leadEditor);
  await leadField.getByRole('button', { name: 'Додати посилання' }).click();
  await expect(page.getByRole('heading', { name: 'Додати посилання' })).toBeVisible();
  await expect(page.getByLabel('Текст посилання')).toHaveValue('Виділений текст');
  await page.getByLabel('Посилання', { exact: true }).fill('example.com/phone');
  await page.locator('.blog-link-dialog').getByRole('button', { name: 'Додати посилання', exact: true }).click();

  const preview = page.frameLocator('iframe[title="Попередній перегляд статті"]');
  await expect(preview.locator('.mt-blog-lead a')).toHaveText('Виділений текст');
  await expect(preview.locator('.mt-blog-lead a')).toHaveAttribute('href', 'https://example.com/phone');

  const paragraphEditor = editors.nth(1);
  const paragraphField = paragraphEditor.locator('..');
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
    clipboard.setData('text/html', '<p><strong>Форматований</strong> <em>текст</em> з <a href="https://example.com/catalog" onclick="alert(1)">посиланням</a><script>alert(2)</script></p>');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  await expect(paragraphEditor.locator('strong')).toHaveText('Форматований');
  await expect(paragraphEditor.locator('a')).toHaveAttribute('href', 'https://example.com/catalog');
  await expect(paragraphEditor.locator('script')).toHaveCount(0);
  await expect(preview.locator('.mt-blog-text a')).toHaveText('посиланням');

  await selectEditorText(paragraphEditor, 'strong');
  await paragraphField.getByLabel('Розмір шрифту').selectOption('24');
  await expect(preview.locator('.mt-blog-text span[style="font-size:24px"]')).toContainText('Форматований');

  await page.getByLabel('Готовий стиль посилань').selectOption('yellowBlack');
  await page.getByLabel('Базовий розмір тексту').selectOption('20');
  await expect.poll(() => preview.locator('.mt-blog-text').evaluate((element) => getComputedStyle(element).fontSize)).toBe('20px');
  await expect.poll(() => preview.locator('.mt-blog-text a').evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color
  }))).toEqual({ background: 'rgb(255, 225, 1)', color: 'rgb(0, 0, 0)' });

  await page.request.patch(`/api/publications/${publication.id}/status`, {
    data: { status: 'cancelled', publicationUrl: '' }
  });
});
