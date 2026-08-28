import { useState } from "react";
import { useNavigate } from "react-router";

import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const navigate = useNavigate();

  const [modo, setModo] = useState("login");

  const [nickname, setNickname] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] =
    useState("");

  const [carregando, setCarregando] =
    useState(false);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] =
    useState("");

  // ======================================================
  // TROCAR ENTRE LOGIN E CADASTRO
  // ======================================================

  function trocarModo(novoModo) {
    setModo(novoModo);

    setErro("");
    setMensagem("");
    setSenha("");
    setConfirmarSenha("");
  }

  // ======================================================
  // SALVAR SESSÃO DO CLIENTE
  // ======================================================

  function salvarSessaoCliente(cliente) {
    localStorage.setItem(
      "narguileaju_token",
      cliente.token
    );

    localStorage.setItem(
      "narguileaju_cliente_id",
      cliente.cliente_id
    );

    localStorage.setItem(
      "narguileaju_nickname",
      cliente.nickname
    );
  }

  // ======================================================
  // LOGIN ADMIN
  // ======================================================

  async function fazerLoginAdmin() {
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: "admin@narguileaju.local",
        password: senha,
      });

    if (error) {
      console.error(
        "Erro login admin:",
        error
      );

      throw new Error(
        "Administrador ou senha incorretos."
      );
    }

    if (!data?.user) {
      throw new Error(
        "Não foi possível entrar como administrador."
      );
    }

    // Busca perfil administrativo
    const {
      data: perfil,
      error: perfilError,
    } = await supabase
      .from("perfis")
      .select("perfil, ativo")
      .eq("id", data.user.id)
      .single();

    if (perfilError) {
      await supabase.auth.signOut();

      throw new Error(
        "Não foi possível validar o administrador."
      );
    }

    if (
      perfil?.perfil !== "admin" ||
      !perfil?.ativo
    ) {
      await supabase.auth.signOut();

      throw new Error(
        "Usuário sem permissão administrativa."
      );
    }

    // Remove eventual sessão de cliente
    localStorage.removeItem(
      "narguileaju_token"
    );

    localStorage.removeItem(
      "narguileaju_cliente_id"
    );

    localStorage.removeItem(
      "narguileaju_nickname"
    );

    localStorage.setItem(
      "narguileaju_admin",
      "true"
    );

    navigate("/admin");
  }

  // ======================================================
  // LOGIN CLIENTE
  // ======================================================

  async function fazerLoginCliente() {
    const { data, error } =
      await supabase.rpc(
        "login_cliente",
        {
          p_estabelecimento_slug:
            "narguileaju",

          p_nickname: nickname,

          p_senha: senha,
        }
      );

    if (error) {
      console.error(
        "Erro Supabase:",
        error
      );

      throw new Error(
        "Não foi possível realizar o login."
      );
    }

    if (!data?.sucesso) {
      throw new Error(
        data?.mensagem ||
          "Nickname ou senha incorretos."
      );
    }

    // Remove eventual sessão admin
    await supabase.auth.signOut();

    localStorage.removeItem(
      "narguileaju_admin"
    );

    salvarSessaoCliente(data);

    navigate("/cliente");
  }

  // ======================================================
  // LOGIN
  // ======================================================

  async function fazerLogin() {
    const nicknameLimpo =
      nickname.trim().toLowerCase();

    // ADMIN
    if (nicknameLimpo === "admin") {
      await fazerLoginAdmin();
      return;
    }

    // CLIENTE
    await fazerLoginCliente();
  }

  // ======================================================
  // CADASTRO CLIENTE
  // ======================================================

  async function fazerCadastro() {
    if (
      nickname.trim().toLowerCase() ===
      "admin"
    ) {
      throw new Error(
        "Este nickname não está disponível."
      );
    }

    if (senha !== confirmarSenha) {
      throw new Error(
        "As senhas digitadas não são iguais."
      );
    }

    const { data, error } =
      await supabase.rpc(
        "cadastrar_cliente",
        {
          p_estabelecimento_slug:
            "narguileaju",

          p_nickname: nickname,

          p_senha: senha,
        }
      );

    if (error) {
      console.error(
        "Erro Supabase:",
        error
      );

      throw new Error(
        "Não foi possível criar sua conta."
      );
    }

    if (!data?.sucesso) {
      throw new Error(
        data?.mensagem ||
          "Não foi possível criar sua conta."
      );
    }

    // ==================================================
    // LOGIN AUTOMÁTICO APÓS CADASTRO
    // ==================================================

    const {
      data: loginData,
      error: loginError,
    } = await supabase.rpc(
      "login_cliente",
      {
        p_estabelecimento_slug:
          "narguileaju",

        p_nickname: nickname,

        p_senha: senha,
      }
    );

    if (
      loginError ||
      !loginData?.sucesso
    ) {
      setMensagem(
        "Conta criada! Agora entre com seu nickname e senha."
      );

      setModo("login");

      setSenha("");
      setConfirmarSenha("");

      return;
    }

    salvarSessaoCliente(loginData);

    navigate("/cliente");
  }

  // ======================================================
  // SUBMIT
  // ======================================================

  async function handleSubmit(event) {
    event.preventDefault();

    setErro("");
    setMensagem("");
    setCarregando(true);

    try {
      const nicknameLimpo =
        nickname.trim();

      if (nicknameLimpo.length < 3) {
        throw new Error(
          "O nickname precisa ter pelo menos 3 caracteres."
        );
      }

      if (nicknameLimpo.length > 20) {
        throw new Error(
          "O nickname pode ter no máximo 20 caracteres."
        );
      }

      if (senha.length < 6) {
        throw new Error(
          "A senha precisa ter pelo menos 6 caracteres."
        );
      }

      if (modo === "cadastro") {
        await fazerCadastro();
      } else {
        await fazerLogin();
      }

    } catch (error) {
      console.error(error);

      setErro(
        error.message ||
          "Ocorreu um erro. Tente novamente."
      );

    } finally {
      setCarregando(false);
    }
  }

  // ======================================================
  // INTERFACE
  // ======================================================

  return (
    <div className="login-page">

      <main className="login-container">

        {/* MARCA */}

        <section className="brand">

          <div className="camel">
            🐪
          </div>

          <h1>
            NARGUILEAJU
          </h1>

          <p>
            O som da noite também é seu.
          </p>

        </section>

        {/* CARD */}

        <section className="login-card">

          {/* ABAS */}

          <div className="login-tabs">

            <button
              type="button"
              className={
                modo === "login"
                  ? "active"
                  : ""
              }
              onClick={() =>
                trocarModo("login")
              }
              disabled={carregando}
            >
              Entrar
            </button>

            <button
              type="button"
              className={
                modo === "cadastro"
                  ? "active"
                  : ""
              }
              onClick={() =>
                trocarModo("cadastro")
              }
              disabled={carregando}
            >
              Criar conta
            </button>

          </div>

          {/* FORMULÁRIO */}

          <form onSubmit={handleSubmit}>

            <label>

              Nickname

              <input
                type="text"
                placeholder="Ex.: Deni"
                value={nickname}
                onChange={(event) =>
                  setNickname(
                    event.target.value
                  )
                }
                minLength={3}
                maxLength={20}
                autoComplete="username"
                disabled={carregando}
                required
              />

            </label>

            <label>

              Senha

              <input
                type="password"
                placeholder="••••••"
                value={senha}
                onChange={(event) =>
                  setSenha(
                    event.target.value
                  )
                }
                minLength={6}
                autoComplete={
                  modo === "cadastro"
                    ? "new-password"
                    : "current-password"
                }
                disabled={carregando}
                required
              />

            </label>

            {modo === "cadastro" && (

              <label>

                Confirmar senha

                <input
                  type="password"
                  placeholder="••••••"
                  value={
                    confirmarSenha
                  }
                  onChange={(event) =>
                    setConfirmarSenha(
                      event.target.value
                    )
                  }
                  minLength={6}
                  autoComplete="new-password"
                  disabled={carregando}
                  required
                />

              </label>

            )}

            {erro && (

              <div className="login-error">
                {erro}
              </div>

            )}

            {mensagem && (

              <div className="login-success">
                {mensagem}
              </div>

            )}

            <button
              type="submit"
              className="primary-button"
              disabled={carregando}
            >

              {carregando
                ? "AGUARDE..."
                : modo === "login"
                  ? "ENTRAR"
                  : "CRIAR CONTA"}

            </button>

          </form>

          <p className="login-help">

            {modo === "login"
              ? "Entre para escolher suas músicas."
              : "Escolha um nickname e crie sua senha."}

          </p>

        </section>

      </main>

    </div>
  );
}