import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ru, { ruPluralForms } from './locales/ru';
import uz from './locales/uz';

type Tree = { [k: string]: unknown };
function mergeDeep(a: object, b: object): Tree {
  const out: Tree = { ...(a as Tree) };
  for (const [k, v] of Object.entries(b)) {
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object'
        ? mergeDeep(out[k] as object, v as object)
        : v;
  }
  return out;
}

void i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    ru: { translation: mergeDeep(ru, ruPluralForms) },
    en: { translation: en },
  },
  lng: 'uz',
  fallbackLng: 'uz',
  supportedLngs: ['uz', 'ru', 'en'],
  interpolation: { escapeValue: false },
  returnObjects: true,
  compatibilityJSON: 'v4',
  showSupportNotice: false,
});

export default i18n;
