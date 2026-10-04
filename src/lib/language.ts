/**
 * Language helpers for release notes: a small, offline heuristic that spots
 * notes that clearly aren't English (so a Translate button can be offered),
 * plus translation that stays honest about where it happens:
 *
 *  - On browsers with the built-in Translator and LanguageDetector APIs, text
 *    is translated on the device — nothing is sent anywhere.
 *  - Everywhere else the button opens Google Translate in a new tab with the
 *    notes prefilled; AppWatch itself never calls a translation service.
 */

// Scripts that are never English: Greek, Cyrillic, Armenian, Hebrew, Arabic,
// Devanagari, Thai, Hangul, kana and CJK ideographs.
const NON_LATIN =
  /[\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu;

const ACCENTED = /[àáâãäåæçèéêëìíîïñòóôõöøùúûüýœß]/giu;

// Common English words in release notes (ambiguous short words left out).
const ENGLISH = new Set(
  (
    'the and to of for you your we with this that are on it our now new fixes fixed bug bugs ' +
    'improvements improved performance app update updates more can from have has be been will ' +
    'by at or not any what when make made get also just thanks using use stability experience ' +
    'version features feature support issue issues minor some faster better'
  ).split(' '),
);

// Distinctive function words and release-note vocabulary in Spanish, French,
// German, Portuguese, Italian and Dutch.
const FOREIGN = new Set(
  (
    'el la los las del para con por una que nuevo nueva nuevas mejoras errores correcciones ' +
    'rendimiento ahora esta este más también le les des une et pour avec vous votre nous dans ' +
    'est sur plus nouvelle nouveau nouvelles corrections améliorations bogues cette sont du au ' +
    'der das und mit für ist nicht wir ihre eine einen neue neuen verbesserungen fehler ' +
    'fehlerbehebungen behoben auf von im bei não com você seu sua novo melhorias correções ' +
    'agora também em ao il di che per sono nuovi miglioramenti correzioni gli della anche ora ' +
    'het een van voor niet jouw nieuwe verbeteringen deze kunt'
  ).split(' '),
);

/** True when `text` is very likely not English. Errs on the side of "English". */
export function looksNonEnglish(text: string): boolean {
  const cleaned = text.replace(/https?:\/\/\S+/g, ' ').replace(/\S+@\S+/g, ' ');
  const letters = cleaned.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return false;

  const nonLatin = cleaned.match(NON_LATIN)?.length ?? 0;
  if (nonLatin >= 4 && nonLatin / letters > 0.3) return true;
  if (letters < 12) return false;

  const words = cleaned.toLowerCase().match(/\p{L}+/gu) ?? [];
  let english = 0;
  let foreign = 0;
  for (const word of words) {
    if (ENGLISH.has(word)) english += 1;
    else if (FOREIGN.has(word)) foreign += 1;
  }
  if (foreign >= 3 && foreign > english * 1.5) return true;

  const accented = cleaned.match(ACCENTED)?.length ?? 0;
  return accented / letters > 0.03 && foreign >= 2 && english <= 1;
}

/** Google Translate, prefilled. Long notes are trimmed to keep the URL valid. */
export function googleTranslateUrl(text: string, target = 'en'): string {
  let slice = text;
  while (encodeURIComponent(slice).length > 6000)
    slice = slice.slice(0, Math.floor(slice.length * 0.8));
  const params = new URLSearchParams({ sl: 'auto', tl: target, text: slice, op: 'translate' });
  return `https://translate.google.com/?${params.toString()}`;
}

/** "es" -> "Spanish". */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

interface Detection {
  detectedLanguage: string;
  confidence: number;
}
interface LanguageDetectorApi {
  create(): Promise<{ detect(text: string): Promise<Detection[]>; destroy?(): void }>;
}
interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<{ translate(text: string): Promise<string>; destroy?(): void }>;
}

function builtInApis(): { detector: LanguageDetectorApi; translator: TranslatorApi } | null {
  const scope = globalThis as unknown as {
    LanguageDetector?: LanguageDetectorApi;
    Translator?: TranslatorApi;
  };
  return scope.LanguageDetector && scope.Translator
    ? { detector: scope.LanguageDetector, translator: scope.Translator }
    : null;
}

/** Whether this browser can translate on the device (Chrome's built-in AI APIs). */
export function canTranslateOnDevice(): boolean {
  return builtInApis() !== null;
}

export interface Translation {
  text: string;
  /** BCP 47 code of the detected source language. */
  source: string;
}

/**
 * Translate on the device. Resolves null when the browser can't (no API, the
 * language pair is unavailable, or the text is already in the target
 * language); the caller then offers Google Translate instead.
 */
export async function translateOnDevice(text: string, target = 'en'): Promise<Translation | null> {
  const apis = builtInApis();
  if (!apis) return null;
  try {
    const detector = await apis.detector.create();
    const [best] = await detector.detect(text);
    detector.destroy?.();
    const source = best?.detectedLanguage;
    if (!source || source === 'und' || source.split('-')[0] === target) return null;
    const availability = await apis.translator.availability({
      sourceLanguage: source,
      targetLanguage: target,
    });
    if (availability === 'unavailable') return null;
    const translator = await apis.translator.create({
      sourceLanguage: source,
      targetLanguage: target,
    });
    const translated = await translator.translate(text);
    translator.destroy?.();
    return translated ? { text: translated, source } : null;
  } catch {
    return null;
  }
}
