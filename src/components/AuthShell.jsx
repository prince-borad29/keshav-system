import { Outlet } from "react-router-dom";
import AuthProvider from "../contexts/AuthContext";

export default function AuthShell() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}