import { createInstance } from "i18next";
import { translations } from "./i18n/resources";

const supportedLanguages = ["en", "zh-CN", "zh-TW", "ja"] as const;

function supportedLanguage(language: string | null): string {
  return language &&
    supportedLanguages.includes(language as (typeof supportedLanguages)[number])
    ? language
    : "en";
}

export function createViewerI18n(language = "en") {
  const translator = createInstance();
  void translator.init({
    lng: supportedLanguage(language),
    fallbackLng: "en",
    supportedLngs: supportedLanguages,
    resources: translations,
    interpolation: { escapeValue: false },
  });
  return translator;
}

function preferredLanguage(): string {
  if (typeof window === "undefined") return "en";
  try {
    return supportedLanguage(window.localStorage.getItem("pcbviewer-language"));
  } catch {
    return "en";
  }
}

export const viewerI18n = createViewerI18n(preferredLanguage());
