import type { i18n } from "i18next";
import { viewerI18n } from "../i18n";

type LocalizedValue = {
  key: string;
  values?: Readonly<Record<string, string | number>>;
};
type ErrorValues = Readonly<Record<string, string | number | LocalizedValue>>;

/** Keep source details available when the UI language changes after a failure. */
export class ParserError extends Error {
  readonly params: ErrorValues;
  constructor(
    readonly code: string,
    params: ErrorValues = {},
    message = code,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ParserError";
    this.params = Object.freeze({ ...params });
  }
  localize(translator: i18n): string {
    return parserMessage(this.code, this.params, translator);
  }
}

export type VisibleError = string | ParserError;
export function visibleError(error: unknown): VisibleError {
  return error instanceof ParserError
    ? error
    : error instanceof Error
      ? error.message
      : String(error);
}

/** Messages remain useful to callers; structured failures can be translated again. */
export function parserMessage(
  key: string,
  values: ErrorValues = {},
  translator: i18n = viewerI18n,
): string {
  const path = `parserErrors.${key}`;
  if (!translator.exists(path))
    throw new Error(`Missing parser translation: ${path}`);
  const resolved = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === "object" ? translator.t(value.key, value.values) : value,
    ]),
  );
  return translator.t(path, resolved);
}

export function parserError(
  key: string,
  values: ErrorValues = {},
  translator: i18n = viewerI18n,
): ParserError {
  return new ParserError(key, values, parserMessage(key, values, translator));
}

export function hfssDefError(
  reason: string,
  offset: number,
  id?: string | number,
  translator: i18n = viewerI18n,
): ParserError {
  const path = `hfssDefReasons.${reason}`;
  if (!translator.exists(path))
    throw new Error(`Missing parser translation: ${path}`);
  return parserError(
    "hfssDefError",
    {
      detail: { key: path, values: id === undefined ? {} : { id } },
      value: `0x${offset.toString(16)}`,
    },
    translator,
  );
}
