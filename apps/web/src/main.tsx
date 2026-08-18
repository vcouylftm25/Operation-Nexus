import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import "@/styles/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Operation Nexus: #root not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
