import { describe, expect, it } from 'vitest';
import { ICON_PX, iconSrc } from '../src/lib/icons.ts';

describe('iconSrc', () => {
  it('requests App Store artwork at one shared size', () => {
    const url =
      'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/83/49/AppIcon-85-220.png/512x512bb.jpg';
    expect(iconSrc(url)).toBe(
      `https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/83/49/AppIcon-85-220.png/${ICON_PX}x${ICON_PX}bb.jpg`,
    );
  });

  it('sizes Google Play icons, replacing any existing size suffix', () => {
    expect(iconSrc('https://play-lh.googleusercontent.com/abc123')).toBe(
      `https://play-lh.googleusercontent.com/abc123=s${ICON_PX}`,
    );
    expect(iconSrc('https://play-lh.googleusercontent.com/abc123=w240-h480-rw')).toBe(
      `https://play-lh.googleusercontent.com/abc123=s${ICON_PX}`,
    );
    expect(iconSrc('https://play-lh.googleusercontent.com/abc123=s512')).toBe(
      `https://play-lh.googleusercontent.com/abc123=s${ICON_PX}`,
    );
  });

  it('leaves other URLs alone', () => {
    expect(iconSrc('https://example.com/icon.png')).toBe('https://example.com/icon.png');
  });
});
