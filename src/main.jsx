import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const isPublic =
  location.pathname.startsWith("/public/") || location.pathname.startsWith("/pass/");

// only one of these ever downloads
const load = isPublic ? import("./PublicRoot.jsx") : import("./AdminRoot.jsx");

load.then(({ default: Root }) => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  );
});