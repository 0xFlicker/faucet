import {
  createContext,
  FC,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import type { InitOptions } from "i18next";
import i18next from "i18next";
import { useTranslation, initReactI18next } from "react-i18next";

interface IContext {
  i18n?: InitOptions;
}
const LocaleContext = createContext<IContext>({});

export const Provider: FC<
  PropsWithChildren<{
    i18n: InitOptions;
  }>
> = ({ children, i18n: i18nOpts }) => {
  useMemo(() => {
    if (i18nOpts) i18next.use(initReactI18next).init(i18nOpts);
  }, [i18nOpts]);

  return (
    <LocaleContext.Provider value={{ i18n: i18nOpts }}>
      {children}
    </LocaleContext.Provider>
  );
};

export function useLocale(ns?: string | string[]): { t: any } {
  const { t } = useTranslation(ns);
  return { t };
}
