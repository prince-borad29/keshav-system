import { BrowserRouter, Routes, Route } from "react-router-dom";
// static imports are fine here: the pages are small, and this avoids another request hop
import PublicSelfServe from "./modules/public/PublicSelfServe";
import DirectPassDownload from "./modules/public/DirectPassDownload";
import PublicDispatch from "./modules/public/PublicDispatch";

export default function PublicApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/pass/:token/:memberId" element={<DirectPassDownload />} />
        <Route path="/public/dispatch/:token" element={<PublicDispatch />} />
        <Route path="/public/qr-pass/:token" element={<PublicSelfServe />} />
      </Routes>
    </BrowserRouter>
  );
}