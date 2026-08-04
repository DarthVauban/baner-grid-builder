import { describe, expect, it } from 'vitest';
import {
  createBlogBlock,
  createBlogPostDocument,
  generateBlogPostExport,
  normalizeBlogPostDocument,
  normalizeSlug,
  renderInlineText,
  sanitizeRichTextHtml
} from './blog-editor';

describe('blog editor export', () => {
  it('creates portable ASCII slugs from Ukrainian titles', () => {
    expect(normalizeSlug('Найкращі смартфони до 20 000 грн')).toBe('naikrashchi-smartfony-do-20-000-hrn');
  });

  it('generates scoped branded HTML, CSS and JavaScript', () => {
    const document = createBlogPostDocument('Огляд смартфонів 2026', 'Короткий опис статті.');
    document.hero.meta = ['Порівняння моделей'];
    document.sections[0].blocks.push(createBlogBlock('faq'));

    const output = generateBlogPostExport(document);

    expect(output.html).toContain('class="mt-blog-post"');
    expect(output.html).toContain('Огляд смартфонів 2026');
    expect(output.html).toContain('<details class="mt-blog-faq-item" open>');
    expect(output.css).toContain('.mt-blog-post .mt-blog-hero');
    expect(output.js).toContain("querySelectorAll('a[href^=\"http\"]')");
    expect(output.js).toContain("dataset.mtInteractive = 'ready'");
    expect(output.combined).toContain('<style type="text/css">');
    expect(output.combined).toContain('<script>');
  });

  it('keeps every image responsive without forcing empty space on mobile', () => {
    const document = createBlogPostDocument('Responsive images', 'Description');
    document.hero.imageUrl = 'https://example.com/wide-hero.jpg';
    document.sections[0].blocks.push({
      id: 'content-image',
      type: 'image',
      url: 'https://example.com/tall-content.jpg',
      alt: 'Content image',
      caption: 'Caption'
    });

    const output = generateBlogPostExport(document);

    expect(output.html).toContain('src="https://example.com/wide-hero.jpg"');
    expect(output.html).toContain('src="https://example.com/tall-content.jpg"');
    expect(output.css).toContain('height: auto !important;');
    expect(output.css).toContain('min-height: 0 !important;');
    expect(output.css).toContain('aspect-ratio: auto !important;');
    expect(output.css).not.toContain('min-height: 180px');
    expect(output.preview).toContain('@media(max-width:480px){body{padding:0}}');
  });

  it('escapes untrusted text and ignores unsafe media URLs', () => {
    const document = createBlogPostDocument('<script>alert(1)</script>', 'Опис');
    document.hero.imageUrl = 'javascript:alert(1)';
    document.sections[0].blocks = [{ id: 'unsafe', type: 'paragraph', text: '<img src=x onerror=alert(1)>' }];

    const output = generateBlogPostExport(document);

    expect(output.html).not.toContain('<script>alert(1)</script>');
    expect(output.html).not.toContain('javascript:alert(1)');
    expect(output.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders supported inline formatting and safe links', () => {
    expect(renderInlineText('**Сильний** *текст* [товар](https://example.com/item)')).toContain('<strong>Сильний</strong>');
    expect(renderInlineText('**Сильний** *текст* [товар](https://example.com/item)')).toContain('<em>текст</em>');
    expect(renderInlineText('**Сильний** *текст* [товар](https://example.com/item)')).toContain('class="mt-blog-label"');
  });

  it('keeps safe pasted rich text while removing executable markup', () => {
    const result = sanitizeRichTextHtml('<p><strong>Жирний</strong> <em>курсив</em> <a href="https://example.com/item" onclick="alert(1)">товар</a><script>alert(1)</script><a href="javascript:alert(2)">небезпечно</a><span style="font-size:24px;color:red">великий</span><span style="font-weight:700;font-style:italic">стилізований</span></p>');

    expect(result).toContain('<strong>Жирний</strong>');
    expect(result).toContain('<em>курсив</em>');
    expect(result).toContain('<a class="mt-blog-label" href="https://example.com/item">товар</a>');
    expect(result).toContain('<span style="font-size:24px">великий</span>');
    expect(result).toContain('<em><strong>стилізований</strong></em>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('javascript:');
  });

  it('preserves Tiptap block content, tables and responsive images', () => {
    const result = sanitizeRichTextHtml('<h2 style="text-align:center" onclick="alert(1)">Заголовок</h2><p><u>Підкреслений</u> і <s>закреслений</s></p><ul><li>Пункт</li></ul><blockquote>Цитата</blockquote><table><tbody><tr><th colspan="2">Назва</th></tr><tr><td>A</td><td>B</td></tr></tbody></table><img src="https://example.com/photo.webp" alt="Фото" onerror="alert(2)"><iframe src="https://example.com"></iframe>');

    expect(result).toContain('<h2 style="text-align:center">Заголовок</h2>');
    expect(result).toContain('<u>Підкреслений</u>');
    expect(result).toContain('<s>закреслений</s>');
    expect(result).toContain('<ul><li>Пункт</li></ul>');
    expect(result).toContain('<blockquote>Цитата</blockquote>');
    expect(result).toContain('<div class="mt-blog-table-wrap"><table class="mt-blog-table">');
    expect(result).toContain('<th colspan="2">Назва</th>');
    expect(result).toContain('class="mt-blog-rich-image"');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('<iframe');
  });

  it('exports Tiptap rich blocks without invalid nested paragraphs', () => {
    const document = createBlogPostDocument('Tiptap', 'Опис');
    document.sections[0].blocks = [{
      id: 'tiptap-content',
      type: 'paragraph',
      text: '<p>Перший абзац</p><h3>Підзаголовок</h3><p>Другий абзац</p><table><tbody><tr><td>Комірка</td></tr></tbody></table>'
    }];

    const output = generateBlogPostExport(document);

    expect(output.html).toContain('class="mt-blog-text mt-blog-rich-content"');
    expect(output.html).toContain('<p>Перший абзац</p><h3>Підзаголовок</h3><p>Другий абзац</p>');
    expect(output.html).toContain('class="mt-blog-table-wrap"');
    expect(output.html).not.toContain('<p class="mt-blog-text"><p>');
    expect(output.css).toContain('.mt-blog-post .mt-blog-rich-content');
  });

  it('exports configurable typography and link plaques', () => {
    const document = createBlogPostDocument('Стилі посилань', 'Опис');
    document.typography.bodyFontSize = 20;
    document.linkAppearance = {
      backgroundColor: '#ffe101',
      textColor: '#000000',
      borderColor: '#ffe101',
      borderRadius: 999,
      fontWeight: 900
    };
    document.sections[0].blocks = [{
      id: 'rich-text',
      type: 'paragraph',
      text: '<strong>Новинка</strong> <a href="https://example.com/phone">Samsung A56</a>'
    }];

    const output = generateBlogPostExport(document);

    expect(output.html).toContain('<strong>Новинка</strong>');
    expect(output.html).toContain('class="mt-blog-label" href="https://example.com/phone"');
    expect(output.css).toContain('--mt-body-font-size: 20px');
    expect(output.css).toContain('--mt-link-background: #ffe101');
    expect(output.css).toContain('--mt-link-radius: 999px');
    expect(output.css).toContain('--mt-link-weight: 900');
  });

  it('fills new design defaults for legacy drafts', () => {
    const current = createBlogPostDocument('Стара чернетка', 'Опис');
    const legacy = { ...current } as Partial<typeof current>;
    delete legacy.typography;
    delete legacy.linkAppearance;
    const normalized = normalizeBlogPostDocument(legacy as typeof current);

    expect(normalized.typography.bodyFontSize).toBe(18);
    expect(normalized.linkAppearance.backgroundColor).toBe('#000000');
  });
});
