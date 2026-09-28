import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StyledSelect } from './StyledSelect';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function openMenu(top: number, contentHeight: number) {
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 768);
  const rect = { top, bottom: top + 48, left: 364, right: 582, width: 218, height: 48, x: 364, y: top, toJSON: () => ({}) };
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(contentHeight);
  render(<StyledSelect ariaLabel="Стікер" value="" options={[{ value: '', label: 'Оберіть стікер' }]} onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Стікер' }));
  return screen.getByRole('listbox');
}

describe('StyledSelect positioning', () => {
  it('anchors a short upward menu to its field using the real menu height', () => {
    const menu = openMenu(700, 44);
    expect(menu.style.top).toBe('650px');
    expect(menu.style.left).toBe('364px');
    expect(menu.style.width).toBe('218px');
  });

  it('keeps a short list below the field when the actual list fits', () => {
    const menu = openMenu(600, 44);
    expect(menu.style.top).toBe('654px');
  });

  it('caps a long upward list and keeps its bottom next to the field', () => {
    const menu = openMenu(700, 600);
    expect(menu.style.top).toBe('454px');
    expect(menu.style.maxHeight).toBe('240px');
  });

  it('repositions the open menu when its scrolling container moves', () => {
    const menu = openMenu(700, 44);
    vi.mocked(HTMLButtonElement.prototype.getBoundingClientRect).mockReturnValue({ top: 500, bottom: 548, left: 364, right: 582, width: 218, height: 48, x: 364, y: 500, toJSON: () => ({}) });
    fireEvent.scroll(window);
    expect(menu.style.top).toBe('554px');
  });
});
