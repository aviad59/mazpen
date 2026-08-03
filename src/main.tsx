import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { RequestPage } from "./pages/RequestPage";
import "./index.css";

const isRequestPage = window.location.pathname === "/request" || window.location.pathname === "/request/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isRequestPage ? <RequestPage /> : <App />}
  </React.StrictMode>
);
