import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthGuard from "./components/layout/AuthGuard";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import NewAnalysisPage from "./pages/NewAnalysisPage";
import AnalysisView from "./pages/AnalysisView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <DashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/new"
          element={
            <AuthGuard>
              <NewAnalysisPage />
            </AuthGuard>
          }
        />
        <Route
          path="/analysis/:projectId"
          element={
            <AuthGuard>
              <AnalysisView />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}