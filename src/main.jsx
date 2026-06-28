import React from "react";
import { createRoot } from "react-dom/client";
import DnDSheet from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DnDSheet />
  </React.StrictMode>
);
