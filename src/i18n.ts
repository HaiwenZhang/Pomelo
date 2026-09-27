import { createInstance } from "i18next";
import { translations } from "./i18n/resources";

export function createViewerI18n(language: string) {
  const translator = createInstance();
  void translator.init({
    lng: language,
    fallbackLng: "en",
    supportedLngs: ["zh-CN", "en"],
    resources: translations,
    interpolation: { escapeValue: false },
  });
  return translator;
}

function preferredLanguage(): string {
  if (typeof window === "undefined") return "zh-CN";
  const saved = window.localStorage.getItem("pcbviewer-language");
  return saved ?? "zh-CN";
}

export const viewerI18n = createViewerI18n(preferredLanguage());
