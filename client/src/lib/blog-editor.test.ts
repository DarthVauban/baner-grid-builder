import { describe, expect, it } from 'vitest';
import { createBlogBlock, createBlogPostDocument, generateBlogPostExport, normalizeSlug, renderInlineText } from './blog-editor';

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
});
