import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router";

import LoginPage from "./pages/LoginPage";
import ClientePage from "./pages/ClientePage";
import BuscarMusicaPage from "./pages/BuscarMusicaPage";
import AdminPage from "./pages/AdminPage";
import TvPage from "./pages/TvPage";

import AdminRoute from "./components/AdminRoute";

export default function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={
            <LoginPage />
          }
        />

        <Route
          path="/cliente"
          element={
            <ClientePage />
          }
        />

        <Route
          path="/buscar"
          element={
            <BuscarMusicaPage />
          }
        />

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />

        <Route
          path="/tv"
          element={
            <TvPage />
          }
        />

      </Routes>

    </BrowserRouter>
  );
}