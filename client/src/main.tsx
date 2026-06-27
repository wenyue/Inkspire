import React from "react";
import { createRoot } from "react-dom/client";
import AppRoot from "./AppRoot";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
