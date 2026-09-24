import { useEffect, useMemo } from 'react';
import { usePrefs, type Lang } from '@/state/prefsStore';
import { en, type MessageKey } from './en';
import { hi } from './hi';

export type { MessageKey };
export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, hi };

export const LANGUAGES: { id: Lang; native: string; english: string; sample: string }[] = [
  { id: 'en', native: 'English', english: 'English', sample: 'Hello' },
  { id: 'hi', native: 'हिन्दी', english: 'Hindi', sample: 'नमस्ते' },
];

export function makeT(lang: Lang): T {
  const dict = DICTS[lang];
  return (key, vars) => {
    const s = dict[key] ?? en[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
  };
}

/** Current UI language (English until one is chosen). */
export function useLang(): Lang {
  return usePrefs((s) => s.language) ?? 'en';
}

export function useT(): T {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}

/** Keeps <html lang> in step with the chosen language (screen readers, hyphenation, :lang() CSS). */
export function useDocumentLang() {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }, [lang]);
}
