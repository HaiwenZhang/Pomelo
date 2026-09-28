import type { i18n } from "i18next";
import { viewerI18n } from "../i18n";

type ErrorValues = Record<string, string | number>;

/** Resolve parser failures when they occur, using the currently selected language. */
export function parserMessage(
  key: string,
  values: ErrorValues = {},
  translator: i18n = viewerI18n,
): string {
  const path = `parserErrors.${key}`;
  if (!translator.exists(path))
    throw new Error(`Missing parser translation: ${path}`);
  return translator.t(path, values);
}

export function parserError(
  key: string,
  values: ErrorValues = {},
  translator: i18n = viewerI18n,
): Error {
  return new Error(parserMessage(key, values, translator));
}

export function hfssDefError(
  reason: string,
  offset: number,
  id?: string | number,
  translator: i18n = viewerI18n,
): Error {
  const path = `hfssDefReasons.${reason}`;
  if (!translator.exists(path))
    throw new Error(`Missing parser translation: ${path}`);
  return parserError(
    "hfssDefError",
    { detail: translator.t(path, { id }), value: `0x${offset.toString(16)}` },
    translator,
  );
}
