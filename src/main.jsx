import React from "react";
import { createRoot } from "react-dom/client";
import DnDSheet from "./App.jsx";
import Gate from "./Gate.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Gate>
      <DnDSheet />
    </Gate>
  </React.StrictMode>
);
