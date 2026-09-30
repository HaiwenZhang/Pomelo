import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BoardSearchIndex, type SearchItem } from "../lib/board/search";

export function BoardSearch({
  items,
  onLocate,
}: {
  items: SearchItem[];
  onLocate: (item: SearchItem) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const index = useMemo(() => new BoardSearchIndex(items), [items]);
  const results = useMemo(() => index.find(query), [index, query]);
  const locate = (item: SearchItem) => {
    onLocate(item);
    setQuery("");
  };
  return (
    <section className="board-search" aria-label={t("search.label")}>
      <div className="search-field">
        <Search size={14} />
        <input
          aria-label={t("search.input")}
          placeholder={t("search.placeholder")}
          name="board-search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              locate(results[0]);
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              setQuery("");
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label={t("search.clear")}
            onClick={() => setQuery("")}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {query.trim() && (
        <div className="search-results">
          {results.length ? (
            results.map((item) => (
              <button
                type="button"
                key={`${item.kind}:${item.id}`}
                aria-label={t("search.locate", {
                  kind: t(
                    item.kind === "net" ? "search.net" : "search.component",
                  ),
                  name: item.name,
                })}
                onClick={() => locate(item)}
              >
                <strong>{item.name}</strong>
                <span>
                  {t(item.kind === "net" ? "search.net" : "search.component")} ·{" "}
                  {item.count}{" "}
                  {t(item.kind === "net" ? "search.objects" : "search.pads")}
                </span>
              </button>
            ))
          ) : (
            <p>{t("search.none")}</p>
          )}
          {results.length === 20 && <p>{t("search.limit")}</p>}
        </div>
      )}
    </section>
  );
}
