import { FolderOpen, Globe2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { viewerStore } from "../../lib/viewer-store";
import { Button } from "../ui/button";
import { PomeloMark } from "./pomelo-mark";

export function FileBar({ onOpen }: { onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const name = useStore(viewerStore, (state) => state.file?.name);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = name ? `${name} — Pomelo` : "Pomelo PCB Viewer";
  }, [i18n.language, name]);

  return (
    <header className="topbar">
      <div className="file-bar floating-surface">
        <div className="brand" translate="no">
          <PomeloMark />
          <strong>Pomelo</strong>
        </div>
        <span className="file-bar-divider" aria-hidden="true" />
        <span
          className="file-name"
          title={name ?? t("workspace.unnamed")}
          translate="no"
        >
          {name ?? t("workspace.unnamed")}
        </span>
      </div>
      <div className="top-actions">
        <Button variant="surface" onClick={onOpen}>
          <FolderOpen aria-hidden="true" data-icon="inline-start" />
          <span>{t("workspace.openFile")}</span>
        </Button>
        <label className="language-control floating-surface">
          <Globe2 size={16} aria-hidden="true" />
          <select
            aria-label={t("workspace.language")}
            value={i18n.language}
            onChange={(event) => {
              const language = event.target.value;
              try {
                window.localStorage.setItem("pcbviewer-language", language);
              } catch {
                /* Storage may be disabled. */
              }
              void i18n.changeLanguage(language);
            }}
          >
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="ja">日本語</option>
          </select>
        </label>
      </div>
    </header>
  );
}
