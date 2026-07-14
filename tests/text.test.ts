import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToPlainText, truncate } from '../src/shared/text.ts';

describe('htmlToPlainText', () => {
  it('converts break tags to newlines and strips other markup', () => {
    expect(htmlToPlainText('Bug fixes<br>Performance improvements<br/>New icons')).toBe(
      'Bug fixes\nPerformance improvements\nNew icons',
    );
    expect(htmlToPlainText('<p>Hello <b>world</b></p><p>Second</p>')).toBe('Hello world\nSecond');
  });

  it('renders list items as bullets', () => {
    expect(htmlToPlainText('<ul><li>One</li><li>Two</li></ul>')).toBe('• One\n• Two');
  });

  it('decodes HTML entities', () => {
    expect(htmlToPlainText('Fixes &amp; improvements &#8211; now &lt;faster&gt;')).toBe(
      'Fixes & improvements – now <faster>',
    );
  });

  it('never leaves markup that could be interpreted as HTML', () => {
    const nasty = '<script>alert("x")</script><img src=x onerror=alert(1)>Safe text';
    expect(htmlToPlainText(nasty)).toBe('alert("x")Safe text');
    expect(htmlToPlainText(nasty)).not.toContain('<');
  });

  it('collapses excessive blank lines', () => {
    expect(htmlToPlainText('a<br><br><br><br>b')).toBe('a\n\nb');
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('&amp;&#65;&#x42;')).toBe('&AB');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('&unknown;')).toBe('&unknown;');
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('cuts on a word boundary with an ellipsis', () => {
    const result = truncate('The quick brown fox jumps over the lazy dog', 20);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith('…')).toBe(true);
    expect(result).toBe('The quick brown fox…');
  });
});
