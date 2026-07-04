import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('keeps a native size and current color without MUI runtime styles', () => {
    const { container } = render(<Icon name="home" size={18} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('width', '18');
    expect(svg).toHaveAttribute('height', '18');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveStyle({ width: '18px', height: '18px' });
    expect(svg?.style.fill).toBe('currentcolor');
  });
});
