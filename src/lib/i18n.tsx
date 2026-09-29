import { createContext, useContext, useMemo, type ReactNode } from 'react'
import en from '../locales/en.json'
import es from '../locales/es.json'
import type { ParentLanguage } from '../domains/shared/types'

const DICTIONARIES: Record<ParentLanguage, Record<string, string>> = { en, es }

type Vars = Record<string, string | number>

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`))
}

interface I18nContextValue {
  language: ParentLanguage
  t: (key: string, vars?: Vars) => string
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: (key) => key,
})

export function I18nProvider({ language, children }: { language: ParentLanguage; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTIONARIES[language] ?? DICTIONARIES.en
    return {
      language,
      t: (key, vars) => interpolate(dict[key] ?? DICTIONARIES.en[key] ?? key, vars),
    }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  return useContext(I18nContext)
}
