import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ALL_LOCALES, localeHref } from '../../lib/i18n/locale';
import { catalogs } from '../../lib/i18n/translate';
const m = vi.hoisted(() => ({ query: { next: '/transcribe?resumeTranscription=1', accountCreated: '1' } }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: m.query, isReady: false }) }));
vi.mock('next/compat/router', () => ({ useRouter: () => null }));
vi.mock('next/link', () => ({ default: ({children,...props}:any) => createElement('a',props,children) }));
vi.mock('../../components/NoIndexHead', () => ({ default: () => null }));
import { LocaleProvider } from '../../lib/i18n/react';
import SignupPage from '../../pages/auth/signup';
import LoginPage from '../../pages/auth/login';
const escaped = (s:string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
beforeEach(() => {
  for (const flag of ['PT_BR','ES','JA','KO','PL','AR','ZH_HANS','FR','IT']) vi.stubEnv(`NEXT_PUBLIC_${flag}_AVAILABLE`,'true');
});
afterEach(() => vi.unstubAllEnvs());
describe.each(ALL_LOCALES)('%s account access', locale => {
  it('renders translated signup labels and preserves localized upload intent across modes', () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, {path:localeHref('/auth/signup',locale),children:createElement(SignupPage)}));
    for (const key of ['Account access','Show password','Password must be at least 10 characters.']) {
      expect(catalogs[locale][key], key).toBeTruthy();
      expect(html,key).toContain(escaped(catalogs[locale][key]));
      if(locale !== 'en') expect(catalogs[locale][key],key).not.toBe(key);
    }
    const href = `${localeHref('/auth/login',locale)}?next=${encodeURIComponent(localeHref(m.query.next,locale))}`;
    expect(html).toContain(escaped(href));
    expect(html).not.toContain('signup-name');
    for (const key of ['Hide password','Creating an account is free.']) {
      expect(catalogs[locale][key],key).toBeTruthy();
      if(locale !== 'en') expect(catalogs[locale][key],key).not.toBe(key);
    }
  });
  it('renders the account-created recovery message in the same language', () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider,{path:localeHref('/auth/login',locale),children:createElement(LoginPage)}));
    expect(html).toContain(escaped(catalogs[locale]['Account created. Log in to continue.']));
  });
});
