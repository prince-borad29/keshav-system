import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import AuthProvider from "./contexts/AuthContext";

export default function AdminRoot() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
}