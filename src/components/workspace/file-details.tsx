import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  brdTextEncodings,
  type BrdTextEncoding,
} from "../../lib/allegro/binary/text-decoder";
import { viewerStore } from "../../lib/viewer-store";
import { viewerI18n } from "../../i18n";
import { localizeDiagnostic, localizeEncodingName } from "../../i18n/messages";
import { Button } from "../ui/button";

interface FileDetailsProps {
  encoding: BrdTextEncoding;
  onEncodingChange: (encoding: BrdTextEncoding) => void;
  onReload: () => void;
  sourceFile: RefObject<File | null>;
}

export function FileDetails({
  encoding,
  onEncodingChange,
  onReload,
  sourceFile,
}: FileDetailsProps) {
  const { t } = useTranslation();
  const { file, scene, progress } = useStore(
    viewerStore,
    useShallow(({ file, scene, progress }) => ({ file, scene, progress })),
  );
  return (
    <details className="file-details" open={!scene}>
      <summary>{t("workspace.fileInfo")}</summary>
      {(!file || file.format === undefined || file.format === "brd") && (
        <>
          <label htmlFor="text-encoding">{t("workspace.encoding")}</label>
          <select
            id="text-encoding"
            value={encoding}
            disabled={progress !== null}
            onChange={(e) =>
              onEncodingChange(e.target.value as BrdTextEncoding)
            }
          >
            {brdTextEncodings.map((value) => (
              <option key={value} value={value}>
                {localizeEncodingName(value, viewerI18n)}
              </option>
            ))}
          </select>
          <p>{t("workspace.encodingHint")}</p>
          <Button
            disabled={!sourceFile.current || progress !== null}
            onClick={onReload}
          >
            {t("workspace.reread")}
          </Button>
        </>
      )}
      <span className="section-label">
        {file ? t("workspace.fileInfo") : t("workspace.objectProperties")}
      </span>
      {file ? (
        <dl>
          <dt>{t("workspace.fileSizeLabel")}</dt>
          <dd>{(file.size / 1e6).toFixed(2)} MB</dd>
          <dt>{t("workspace.formatVersion")}</dt>
          <dd>
            {file.format === "odb"
              ? `ODB++ ${file.odb.version}`
              : file.format === "hfss"
                ? `HFSS EDB ${file.hfss.version}`
                : file.format === "pads"
                  ? `PADS 0x${file.pads.version.toString(16)}`
                  : file.format === "kicad"
                    ? `KiCad ${file.kicad.version}`
                    : file.format === "altium"
                      ? "Altium PcbDoc"
                      : file.header.version / 10}
          </dd>
          {file.format === "odb" ? (
            <>
              <dt>Step</dt>
              <dd>{file.odb.step}</dd>
              <dt>{t("workspace.archiveFiles")}</dt>
              <dd>{file.odb.archiveFiles.toLocaleString()}</dd>
              <dt>{t("workspace.sourceUnits")}</dt>
              <dd>{file.odb.units}</dd>
            </>
          ) : file.format === "hfss" ? (
            <>
              <dt>Cell</dt>
              <dd>{file.hfss.cell}</dd>
              <dt>{t("workspace.padstackInstances")}</dt>
              <dd>{file.hfss.padstacks.toLocaleString()}</dd>
            </>
          ) : file.format === "pads" ? (
            <>
              <dt>{t("workspace.importStatus")}</dt>
              <dd>
                {file.pads.incomplete
                  ? t("workspace.partial")
                  : t("workspace.complete")}
              </dd>
              <dt>{t("workspace.pins")}</dt>
              <dd>{scene?.pins.length.toLocaleString()}</dd>
              <dt>{t("workspace.vias")}</dt>
              <dd>{scene?.vias.length.toLocaleString()}</dd>
              <dt>{t("workspace.copperZones")}</dt>
              <dd>{scene?.zones.length.toLocaleString()}</dd>
              <dt>{t("workspace.outlineSegments")}</dt>
              <dd>{scene?.outline.length.toLocaleString()}</dd>
            </>
          ) : file.format === "kicad" ? (
            <>
              <dt>{t("workspace.importStatus")}</dt>
              <dd>
                {file.kicad.incomplete
                  ? t("workspace.partial")
                  : t("workspace.complete")}
              </dd>
              <dt>{t("workspace.sourcePads")}</dt>
              <dd>{file.kicad.sourcePads.toLocaleString()}</dd>
              <dt>{t("workspace.savedZones")}</dt>
              <dd>{scene?.zones.length.toLocaleString()}</dd>
              <dt>{t("workspace.graphics")}</dt>
              <dd>{file.kicad.sourceGraphics.toLocaleString()}</dd>
            </>
          ) : file.format === "altium" ? (
            <>
              <dt>{t("workspace.importStatus")}</dt>
              <dd>
                {file.altium.incomplete
                  ? t("workspace.partial")
                  : t("workspace.complete")}
              </dd>
              <dt>{t("workspace.sourcePads")}</dt>
              <dd>{file.altium.sourcePads.toLocaleString()}</dd>
              <dt>{t("workspace.sourcePolygons")}</dt>
              <dd>{file.altium.sourcePolygons.toLocaleString()}</dd>
              <dt>{t("workspace.sourceRegions")}</dt>
              <dd>{file.altium.sourceRegions.toLocaleString()}</dd>
              <dt>{t("workspace.savedZones")}</dt>
              <dd>{scene?.zones.length.toLocaleString()}</dd>
              <dt>{t("workspace.outlineSegments")}</dt>
              <dd>{scene?.outline.length.toLocaleString()}</dd>
            </>
          ) : (
            <>
              <dt>{t("workspace.usedEncoding")}</dt>
              <dd>{localizeEncodingName(file.encoding, viewerI18n)}</dd>
              <dt>{t("workspace.headerObjects")}</dt>
              <dd>{file.header.objectCount.toLocaleString()}</dd>
            </>
          )}
          <dt>{t("workspace.parsedRecords")}</dt>
          <dd>{file.records.toLocaleString()}</dd>
          {(file.format === undefined || file.format === "brd") && (
            <>
              <dt>{t("workspace.strings")}</dt>
              <dd>{file.header.stringCount.toLocaleString()}</dd>
            </>
          )}
          <dt>{t("workspace.rawText")}</dt>
          <dd>{scene?.texts.length.toLocaleString()}</dd>
          {(file.format === undefined ||
            file.format === "brd" ||
            file.format === "odb") && (
            <>
              <dt>{t("workspace.writer")}</dt>
              <dd>
                {file.format === "odb"
                  ? file.odb.source
                  : file.header.writerVersion}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p>
          {t("workspace.selectHint")}
          <br />
          {t("workspace.selectDetail")}
        </p>
      )}
      {!!scene?.diagnostics.length && (
        <details className="diagnostics">
          <summary>
            {t("workspace.diagnostics", { count: scene.diagnostics.length })}
          </summary>
          {scene.diagnostics.slice(0, 20).map((message, i) => (
            <p key={i}>{localizeDiagnostic(message, viewerI18n)}</p>
          ))}
        </details>
      )}
    </details>
  );
}
