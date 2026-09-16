import React from "react";
import { createRoot } from "react-dom/client";
import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
