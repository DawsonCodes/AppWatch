import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canTranslateOnDevice,
  googleTranslateUrl,
  languageName,
  looksNonEnglish,
  translateOnDevice,
} from '../src/lib/language.ts';

describe('looksNonEnglish', () => {
  it.each([
    [
      'Spanish',
      'Corrección de errores y mejoras de rendimiento. Ahora puedes compartir tus listas.',
    ],
    [
      'French',
      'Corrections de bogues et améliorations des performances. Vous pouvez partager vos listes.',
    ],
    [
      'German',
      'Fehlerbehebungen und Leistungsverbesserungen. Du kannst jetzt deine Listen mit Freunden teilen.',
    ],
    [
      'Portuguese',
      'Correções de erros e melhorias de desempenho. Agora você pode compartilhar suas listas.',
    ],
    ['Japanese', 'バグを修正し、パフォーマンスを改善しました。'],
    ['Chinese', '修复了一些问题并提升了性能。'],
    ['Russian', 'Исправлены ошибки и улучшена производительность.'],
    ['Korean', '버그 수정 및 성능 개선'],
  ])('flags %s', (_, text) => {
    expect(looksNonEnglish(text)).toBe(true);
  });

  it.each([
    'Bug fixes and performance improvements.',
    'Bug fixes.',
    'We fixed the café menu and improved résumé uploads for everyone using the app.',
    "What's new: dark mode, faster sync, and a redesigned Settings screen. Visit https://example.com/es/novedades for details.",
    'Thanks for using Duolingo! Learn Español, Français and 日本語 with new lessons.',
    '',
  ])('leaves English alone: %s', (text) => {
    expect(looksNonEnglish(text)).toBe(false);
  });
});

describe('googleTranslateUrl', () => {
  it('prefills Google Translate with auto-detection', () => {
    const url = new URL(googleTranslateUrl('Hola mundo'));
    expect(url.origin).toBe('https://translate.google.com');
    expect(url.searchParams.get('sl')).toBe('auto');
    expect(url.searchParams.get('tl')).toBe('en');
    expect(url.searchParams.get('text')).toBe('Hola mundo');
  });

  it('trims very long notes so the URL stays usable', () => {
    const url = googleTranslateUrl('修复'.repeat(5000));
    expect(url.length).toBeLessThan(7000);
  });
});

describe('languageName', () => {
  it('names languages in English and falls back to the code', () => {
    expect(languageName('es')).toBe('Spanish');
    expect(languageName('not a code!')).toBe('not a code!');
  });
});

describe('translateOnDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null where the browser has no built-in translator', async () => {
    expect(canTranslateOnDevice()).toBe(false);
    await expect(translateOnDevice('Hola')).resolves.toBeNull();
  });

  it('detects the language and translates on the device', async () => {
    const translate = vi.fn(async () => 'Hello world');
    vi.stubGlobal('LanguageDetector', {
      create: async () => ({ detect: async () => [{ detectedLanguage: 'es', confidence: 0.98 }] }),
    });
    vi.stubGlobal('Translator', {
      availability: async () => 'available',
      create: async () => ({ translate }),
    });
    expect(canTranslateOnDevice()).toBe(true);
    await expect(translateOnDevice('Hola mundo')).resolves.toEqual({
      text: 'Hello world',
      source: 'es',
    });
    expect(translate).toHaveBeenCalledWith('Hola mundo');
  });

  it('returns null for an unavailable pair, English input, or a failure', async () => {
    let language = 'xx';
    vi.stubGlobal('LanguageDetector', {
      create: async () => ({
        detect: async () => [{ detectedLanguage: language, confidence: 0.9 }],
      }),
    });
    vi.stubGlobal('Translator', {
      availability: async () => 'unavailable',
      create: async () => {
        throw new Error('should not be called');
      },
    });
    await expect(translateOnDevice('text')).resolves.toBeNull();
    language = 'en-US';
    await expect(translateOnDevice('text')).resolves.toBeNull();
    vi.stubGlobal('LanguageDetector', {
      create: async () => {
        throw new Error('model missing');
      },
    });
    await expect(translateOnDevice('text')).resolves.toBeNull();
  });
});
