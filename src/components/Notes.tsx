import { useMemo, useState } from 'preact/hooks';
import type { Translation } from '../lib/language.ts';
import {
  canTranslateOnDevice,
  googleTranslateUrl,
  languageName,
  looksNonEnglish,
  translateOnDevice,
} from '../lib/language.ts';
import { ExternalIcon, TranslateIcon } from './Icons.tsx';

type TranslateState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done'; result: Translation }
  | { phase: 'failed' };

/**
 * Release notes as plain text, clamped with Show more / Show less. Notes that
 * aren't in English get a Translate control: translated right here on
 * browsers that can do it on the device, otherwise opened in Google
 * Translate in a new tab.
 */
export function Notes({ text, clampAt = 260 }: { text: string; clampAt?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [translate, setTranslate] = useState<TranslateState>({ phase: 'idle' });
  const [showOriginal, setShowOriginal] = useState(false);
  const foreign = useMemo(() => looksNonEnglish(text), [text]);

  const translated = translate.phase === 'done' && !showOriginal ? translate.result : null;
  const shown = translated ? translated.text : text;
  const long = shown.length > clampAt;

  async function runTranslate() {
    setTranslate({ phase: 'working' });
    const result = await translateOnDevice(text);
    setTranslate(result ? { phase: 'done', result } : { phase: 'failed' });
    setShowOriginal(false);
  }

  return (
    <div class={`notes${long && !expanded ? ' notes--clamped' : ''}`}>
      <p class="notes__text" lang={translated ? 'en' : undefined}>
        {shown}
      </p>
      <div class="notes__actions">
        {long ? (
          <button
            type="button"
            class="notes__toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        ) : null}
        {foreign ? (
          translate.phase === 'done' ? (
            <span class="translate translate--done">
              <TranslateIcon size={14} />
              <span>
                {showOriginal
                  ? `Original (${languageName(translate.result.source)})`
                  : `Translated from ${languageName(translate.result.source)} on this device`}
              </span>
              <button
                type="button"
                class="notes__toggle"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? 'Show translation' : 'Show original'}
              </button>
            </span>
          ) : canTranslateOnDevice() && translate.phase !== 'failed' ? (
            <button
              type="button"
              class="translate"
              disabled={translate.phase === 'working'}
              onClick={runTranslate}
            >
              <TranslateIcon size={14} />
              <span aria-live="polite">
                {translate.phase === 'working' ? 'Translating…' : 'Translate to English'}
              </span>
            </button>
          ) : (
            <a
              class="translate"
              href={googleTranslateUrl(text)}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens Google Translate in a new tab"
            >
              <TranslateIcon size={14} />
              <span>
                {translate.phase === 'failed'
                  ? 'Couldn’t translate here — open Google Translate'
                  : 'Translate'}
              </span>
              <ExternalIcon size={11} />
            </a>
          )
        ) : null}
      </div>
    </div>
  );
}
