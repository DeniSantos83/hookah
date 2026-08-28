import { useEffect, useState } from "react";
import { Navigate } from "react-router";

import { supabase } from "../lib/supabase";

export default function AdminRoute({
  children,
}) {
  const [carregando, setCarregando] =
    useState(true);

  const [autorizado, setAutorizado] =
    useState(false);

  useEffect(() => {
    verificarAdmin();
  }, []);

  async function verificarAdmin() {
    try {
      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      if (!session?.user) {
        setAutorizado(false);
        return;
      }

      const {
        data: perfil,
        error,
      } = await supabase
        .from("perfis")
        .select("perfil, ativo")
        .eq(
          "id",
          session.user.id
        )
        .single();

      if (error) {
        setAutorizado(false);
        return;
      }

      if (
        perfil?.perfil === "admin" &&
        perfil?.ativo === true
      ) {
        setAutorizado(true);
      } else {
        setAutorizado(false);
      }

    } catch (error) {
      console.error(
        "Erro ao validar admin:",
        error
      );

      setAutorizado(false);

    } finally {
      setCarregando(false);
    }
  }

  if (carregando) {
    return (
      <div className="admin-loading">
        🐪 Verificando acesso...
      </div>
    );
  }

  if (!autorizado) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return children;
}