import React from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./app/App";
import { viewerI18n } from "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={viewerI18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>,
);
