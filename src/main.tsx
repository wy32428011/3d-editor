import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/editor.css";

/** 挂载 React 应用，所有编辑器状态从 App 统一流转。 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
