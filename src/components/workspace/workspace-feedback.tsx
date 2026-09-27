import { FolderOpen, ShieldCheck, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { viewerStore } from "../../lib/viewer-store";
import { viewerI18n } from "../../i18n";
import { localizeError, localizePhase } from "../../i18n/messages";
import { Button } from "../ui/button";
import { PomeloMark } from "./pomelo-mark";

export function WorkspaceFeedback({
  dragging,
  onOpen,
}: {
  dragging: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { file, progress, phase, error, gpuError } = useStore(
    viewerStore,
    useShallow(({ file, progress, phase, error, gpuError }) => ({
      file,
      progress,
      phase,
      error,
      gpuError,
    })),
  );
  return (
    <>
      {!file && progress === null ? (
        <section className="welcome">
          <PomeloMark className="welcome-mark" />
          <h1>{t("workspace.headline")}</h1>
          <p>
            {t("workspace.intro")}
            <br />
            {t("workspace.introDetail")}
          </p>
          <Button className="open-large" onClick={onOpen}>
            <FolderOpen aria-hidden="true" data-icon="inline-start" />
            {t("workspace.openFile")}
          </Button>
          <small>{t("workspace.dropHint")}</small>
          <span className="welcome-local">
            <ShieldCheck size={15} aria-hidden="true" />
            {t("workspace.local")}
          </span>
        </section>
      ) : null}
      {progress !== null ? (
        <section
          className="loading-card floating-surface"
          role="status"
          aria-live="polite"
        >
          <span className="section-label">{t("workspace.opening")}…</span>
          <h2>{localizePhase(phase, viewerI18n)}</h2>
          <progress
            aria-label={t("workspace.opening")}
            value={progress}
            max={1}
          />
          <p>{Math.round(progress * 100)}%</p>
          <Button
            variant="outline"
            onClick={() => viewerStore.getState().cancel()}
          >
            {t("workspace.cancel")}
          </Button>
        </section>
      ) : null}
      {file?.format === "pads" && file.pads.incomplete ? (
        <div className="format-notice" role="status">
          {t("workspace.padsNotice")}
          {!file.pads.sourceOutlines ? t("workspace.outlineNotice") : null}
        </div>
      ) : null}
      {file?.format === "kicad" && file.kicad.incomplete ? (
        <div className="format-notice" role="status">
          {t("workspace.kicadNotice")}
        </div>
      ) : null}
      {file?.format === "altium" && file.altium.incomplete ? (
        <div className="format-notice" role="status">
          {t("workspace.altiumNotice")}
        </div>
      ) : null}
      {error || gpuError ? (
        <div className="error-banner" role="alert">
          <span>{localizeError(error || gpuError, viewerI18n)}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("workspace.closeNotice")}
            onClick={() => {
              viewerStore.getState().setError("");
              viewerStore.getState().setGpuError("");
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      {dragging ? (
        <div className="drop-overlay">
          <Upload size={36} aria-hidden="true" />
          <h2>{t("workspace.drop")}</h2>
        </div>
      ) : null}
    </>
  );
}
