import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { supabase } from "../lib/supabase";

export default function AdminPage() {
  const navigate = useNavigate();

  const [painel, setPainel] = useState(null);
  const [fotos, setFotos] = useState([]);

  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [processandoFoto, setProcessandoFoto] = useState(null);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  // Mensagem/letreiro exibido na TV
  const [mensagemTv, setMensagemTv] = useState("");
  const [mensagemTvAtiva, setMensagemTvAtiva] = useState(false);

  // ======================================================
  // CARREGAR PAINEL
  // ======================================================

  async function carregarPainel() {
    try {
      const { data, error } = await supabase.rpc(
        "painel_anfitriao",
        {
          p_sala_codigo: "NARGUILEAJU",
        }
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem ||
            "Não foi possível carregar o painel."
        );
      }

      setPainel(data);

      // Sincroniza o formulário do letreiro com a configuração atual.
      setMensagemTv(data?.mensagem_tv || "");
      setMensagemTvAtiva(Boolean(data?.mensagem_tv_ativa));
    } catch (error) {
      console.error(
        "Erro ao carregar painel:",
        error
      );

      setErro(
        error.message ||
          "Não foi possível carregar o painel."
      );
    }
  }

  // ======================================================
  // CARREGAR FOTOS PENDENTES
  // ======================================================

  async function carregarFotos() {
    try {
      const { data, error } = await supabase.rpc(
        "fotos_pendentes",
        {
          p_sala_codigo: "NARGUILEAJU",
        }
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem ||
            "Não foi possível carregar as fotos."
        );
      }

      setFotos(data?.fotos || []);
    } catch (error) {
      console.error(
        "Erro ao carregar fotos:",
        error
      );

      setErro(
        "Não foi possível carregar as fotos pendentes."
      );
    }
  }

  // ======================================================
  // CARREGAMENTO INICIAL
  // ======================================================

  async function carregarTudo() {
    setCarregando(true);

    try {
      await Promise.all([
        carregarPainel(),
        carregarFotos(),
      ]);

      setErro("");
    } finally {
      setCarregando(false);
    }
  }

  // ======================================================
  // REALTIME
  // ======================================================

  useEffect(() => {
    carregarTudo();

    const canal = supabase
      .channel("admin-narguileaju")

      // FILA
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fila_musicas",
        },
        () => {
          carregarPainel();
        }
      )

      // CONFIGURAÇÕES
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "configuracoes_sala",
        },
        () => {
          carregarPainel();
        }
      )

      // FOTOS
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fotos",
        },
        () => {
          carregarFotos();
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  // ======================================================
  // EXECUTAR AÇÃO ADMIN
  // ======================================================

  async function executarAcao(
    funcao,
    parametros
  ) {
    if (processando) {
      return;
    }

    setProcessando(true);
    setErro("");
    setMensagem("");

    try {
      const { data, error } = await supabase.rpc(
        funcao,
        parametros
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem ||
            "Não foi possível realizar a operação."
        );
      }

      setMensagem(
        data?.mensagem ||
          "Operação realizada."
      );

      await carregarPainel();
    } catch (error) {
      console.error(
        "Erro ao executar ação:",
        error
      );

      setErro(
        error.message ||
          "Não foi possível realizar a operação."
      );
    } finally {
      setProcessando(false);
    }
  }

  // ======================================================
  // ALTERAR LIMITE
  // ======================================================

  function alterarLimite(limite) {
    executarAcao(
      "alterar_limite_sala",
      {
        p_sala_codigo: "NARGUILEAJU",
        p_limite: limite,
      }
    );
  }

  // ======================================================
  // ALTERAR DURAÇÃO MÁXIMA
  // ======================================================

  function alterarDuracaoMaxima(segundos) {
    executarAcao(
      "alterar_duracao_maxima_sala",
      {
        p_sala_codigo: "NARGUILEAJU",
        p_duracao_maxima_segundos: segundos,
      }
    );
  }

  // ======================================================
  // MENSAGEM / LETREIRO DA TV
  // ======================================================

  function salvarMensagemTv() {
    const texto = mensagemTv.trim();

    if (mensagemTvAtiva && !texto) {
      setErro(
        "Digite uma mensagem antes de ativar o letreiro."
      );
      return;
    }

    executarAcao(
      "alterar_mensagem_tv",
      {
        p_sala_codigo: "NARGUILEAJU",
        p_mensagem: texto || null,
        p_ativa: mensagemTvAtiva && Boolean(texto),
      }
    );
  }

  function alterarStatusMensagemTv(ativa) {
    const texto = mensagemTv.trim();

    if (ativa && !texto) {
      setErro(
        "Digite uma mensagem antes de ativar o letreiro."
      );
      return;
    }

    setMensagemTvAtiva(ativa);

    executarAcao(
      "alterar_mensagem_tv",
      {
        p_sala_codigo: "NARGUILEAJU",
        p_mensagem: texto || null,
        p_ativa: ativa && Boolean(texto),
      }
    );
  }

  // ======================================================
  // TOCAR
  // ======================================================

  function tocarMusica(id) {
    executarAcao(
      "tocar_musica",
      {
        p_sala_codigo: "NARGUILEAJU",
        p_musica_id: id,
      }
    );
  }

  // ======================================================
  // PRÓXIMA
  // ======================================================

  function proximaMusica() {
    executarAcao(
      "proxima_musica",
      {
        p_sala_codigo: "NARGUILEAJU",
      }
    );
  }

  // ======================================================
  // REMOVER MÚSICA
  // ======================================================

  function removerMusica(id) {
    const confirmar = window.confirm(
      "Remover esta música da fila?"
    );

    if (!confirmar) {
      return;
    }

    executarAcao(
      "remover_musica_fila",
      {
        p_sala_codigo: "NARGUILEAJU",
        p_musica_id: id,
      }
    );
  }

  // ======================================================
  // ALTERAR STATUS DA FOTO
  // ======================================================

  async function alterarFoto(
    fotoId,
    novoStatus
  ) {
    if (processandoFoto) {
      return;
    }

    const texto =
      novoStatus === "aprovada"
        ? "Aprovar esta foto para aparecer na TV?"
        : "Rejeitar esta foto?";

    const confirmar = window.confirm(texto);

    if (!confirmar) {
      return;
    }

    setProcessandoFoto(fotoId);
    setErro("");
    setMensagem("");

    try {
      const { data, error } = await supabase.rpc(
        "alterar_status_foto",
        {
          p_foto_id: fotoId,
          p_status: novoStatus,
        }
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem ||
            "Não foi possível alterar a foto."
        );
      }

      if (novoStatus === "aprovada") {
        setMensagem(
          "Foto aprovada para exibição na TV."
        );
      } else {
        setMensagem(
          "Foto rejeitada."
        );
      }

      await carregarFotos();
    } catch (error) {
      console.error(
        "Erro na foto:",
        error
      );

      setErro(
        error.message ||
          "Não foi possível atualizar a foto."
      );
    } finally {
      setProcessandoFoto(null);
    }
  }

  // ======================================================
  // ABRIR TELA DA TV
  // ======================================================

  function abrirTv() {
    const urlTv =
      `${window.location.origin}${window.location.pathname}#/tv`;

    window.open(
      urlTv,
      "_blank",
      "noopener,noreferrer"
    );
  }

  // ======================================================
  // LOGOUT
  // ======================================================

  async function sair() {
    try {
      setProcessando(true);

      await supabase.auth.signOut();

      localStorage.removeItem(
        "narguileaju_admin"
      );

      localStorage.removeItem(
        "narguileaju_token"
      );

      localStorage.removeItem(
        "narguileaju_cliente_id"
      );

      localStorage.removeItem(
        "narguileaju_nickname"
      );

      navigate("/");
    } catch (error) {
      console.error(
        "Erro ao sair:",
        error
      );

      setErro(
        "Não foi possível encerrar a sessão."
      );

      setProcessando(false);
    }
  }

  // ======================================================
  // CARREGANDO
  // ======================================================

  if (carregando) {
    return (
      <div className="admin-loading">
        🐪 Carregando painel...
      </div>
    );
  }

  const tocando = painel?.tocando;
  const fila = painel?.fila || [];

  // ======================================================
  // INTERFACE
  // ======================================================

  return (
    <div className="admin-page">

      {/* ==================================================
          CABEÇALHO
      ================================================== */}

      <header className="admin-header">

        <div>

          <span className="admin-brand">
            🐪 NARGUILEAJU
          </span>

          <h1>
            Painel do Anfitrião
          </h1>

          <p>
            Controle da música e da experiência do lounge
          </p>

        </div>

        <div className="admin-header-actions">

          <div className="lounge-status">
            <span></span>
            Lounge aberto
          </div>

          <button
            type="button"
            className="admin-tv-button"
            onClick={abrirTv}
            title="Abrir tela da TV"
          >
            📺 ABRIR TV
          </button>

          <button
            type="button"
            className="admin-logout-button"
            onClick={sair}
            disabled={processando}
          >
            Sair
          </button>

        </div>

      </header>

      <main className="admin-content">

        {/* ==================================================
            MENSAGENS
        ================================================== */}

        {erro && (
          <div className="admin-error">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="admin-success">
            {mensagem}
          </div>
        )}

        {/* ==================================================
            LIMITE
        ================================================== */}

        <section className="admin-card">

          <div className="admin-card-title">

            <div>

              <span>
                CONFIGURAÇÃO
              </span>

              <h2>
                Limite por pessoa
              </h2>

            </div>

            <strong className="current-limit">
              {painel?.limite ?? 0}
            </strong>

          </div>

          <p className="limit-description">
            Quantidade máxima de músicas que cada
            cliente pode manter simultaneamente na fila.
          </p>

          <div className="limit-buttons">

            {[1, 2, 3, 4, 5].map(
              (numero) => (

                <button
                  type="button"
                  key={numero}
                  disabled={processando}
                  className={
                    painel?.limite === numero
                      ? "limit-active"
                      : ""
                  }
                  onClick={() =>
                    alterarLimite(numero)
                  }
                >
                  {numero}
                </button>

              )
            )}

          </div>

          <div className="quick-limit">

            <button
              type="button"
              disabled={processando}
              onClick={() =>
                alterarLimite(3)
              }
            >

              Noite normal

              <strong>
                3 músicas
              </strong>

            </button>

            <button
              type="button"
              disabled={processando}
              onClick={() =>
                alterarLimite(1)
              }
            >

              Lounge cheio

              <strong>
                1 música
              </strong>

            </button>

          </div>

        </section>

        {/* ==================================================
            DURAÇÃO MÁXIMA
        ================================================== */}

        <section className="admin-card">

          <div className="admin-card-title">

            <div>

              <span>
                CONFIGURAÇÃO
              </span>

              <h2>
                Duração máxima por música
              </h2>

            </div>

            <strong className="duration-current-limit">
              {painel?.duracao_maxima_segundos == null
                ? "∞"
                : `${Math.round(
                    painel.duracao_maxima_segundos / 60
                  )} min`}
            </strong>

          </div>

          <p className="limit-description">
            Vídeos acima do tempo definido ficam indisponíveis
            para os clientes na busca de músicas.
          </p>

          <div className="duration-limit-buttons">

            {[
              { label: "2 min", value: 120 },
              { label: "4 min", value: 240 },
              { label: "6 min", value: 360 },
              { label: "30 min", value: 1800 },
              { label: "1 hora", value: 3600 },
              { label: "Sem limite", value: null },
            ].map((opcao) => (

              <button
                type="button"
                key={opcao.label}
                disabled={processando}
                className={
                  painel?.duracao_maxima_segundos === opcao.value
                    ? "duration-limit-active"
                    : ""
                }
                onClick={() =>
                  alterarDuracaoMaxima(opcao.value)
                }
              >
                {opcao.label}
              </button>

            ))}

          </div>

        </section>

        {/* ==================================================
            MENSAGEM DO TELÃO
        ================================================== */}

        <section className="admin-card admin-tv-message-card">

          <div className="admin-card-title">

            <div>

              <span>
                TELÃO
              </span>

              <h2>
                Mensagem do telão
              </h2>

            </div>

            <div
              className={
                mensagemTvAtiva
                  ? "tv-message-status active"
                  : "tv-message-status"
              }
            >
              <i></i>
              {mensagemTvAtiva ? "ATIVA" : "DESATIVADA"}
            </div>

          </div>

          <p className="limit-description">
            A mensagem passa continuamente no rodapé do vídeo
            e fica atrás do card das fotos.
          </p>

          <textarea
            className="admin-tv-message-input"
            value={mensagemTv}
            maxLength={220}
            disabled={processando}
            placeholder="Ex.: Happy Hour até às 20h • Siga @narguileaju • Marque a gente nas suas fotos!"
            onChange={(event) =>
              setMensagemTv(event.target.value)
            }
          />

          <div className="admin-tv-message-meta">
            <span>
              {mensagemTv.length} / 220 caracteres
            </span>

            <span>
              A alteração aparece no telão automaticamente.
            </span>
          </div>

          <div className="admin-tv-message-actions">

            <button
              type="button"
              className="admin-tv-message-save"
              disabled={processando}
              onClick={salvarMensagemTv}
            >
              SALVAR MENSAGEM
            </button>

            <button
              type="button"
              className={
                mensagemTvAtiva
                  ? "admin-tv-message-toggle active"
                  : "admin-tv-message-toggle"
              }
              disabled={processando}
              onClick={() =>
                alterarStatusMensagemTv(!mensagemTvAtiva)
              }
            >
              {mensagemTvAtiva
                ? "DESATIVAR LETREIRO"
                : "ATIVAR LETREIRO"}
            </button>

          </div>

        </section>

        {/* ==================================================
            TOCANDO AGORA
        ================================================== */}

        <section className="admin-card">

          <div className="admin-section-header">

            <div>

              <span>
                PLAYER
              </span>

              <h2>
                Tocando agora
              </h2>

            </div>

            {tocando && (
              <div className="playing-dot">
                ▶ AO VIVO
              </div>
            )}

          </div>

          {tocando ? (

            <div className="admin-now-playing">

              {tocando.thumbnail_url ? (

                <img
                  src={tocando.thumbnail_url}
                  alt=""
                />

              ) : (

                <div className="admin-thumbnail-placeholder">
                  ♫
                </div>

              )}

              <div className="now-playing-info">

                <strong>
                  {tocando.titulo}
                </strong>

                <span>
                  {tocando.artista}
                </span>

                <small>

                  Pedido por{" "}

                  <b>
                    {tocando.nickname ||
                      "Cliente"}
                  </b>

                </small>

              </div>

            </div>

          ) : (

            <div className="admin-empty">

              <span>
                ♫
              </span>

              Nenhuma música tocando.

            </div>

          )}

          <button
            type="button"
            className="next-button"
            disabled={
              processando ||
              (
                !tocando &&
                fila.length === 0
              )
            }
            onClick={proximaMusica}
          >
            ⏭ PRÓXIMA MÚSICA
          </button>

        </section>

        {/* ==================================================
            FILA
        ================================================== */}

        <section className="admin-card">

          <div className="admin-section-header">

            <div>

              <span>
                JUKEBOX
              </span>

              <h2>
                Fila de músicas
              </h2>

            </div>

            <strong className="queue-count">
              {fila.length}
            </strong>

          </div>

          {fila.length === 0 ? (

            <div className="admin-empty">

              <span>
                ♫
              </span>

              Nenhuma música aguardando.

            </div>

          ) : (

            <div className="admin-queue">

              {fila.map(
                (musica, index) => (

                  <article
                    className="admin-music"
                    key={musica.id}
                  >

                    <div className="queue-position">
                      {index + 1}
                    </div>

                    {musica.thumbnail_url ? (

                      <img
                        src={musica.thumbnail_url}
                        alt=""
                      />

                    ) : (

                      <div className="admin-music-placeholder">
                        ♫
                      </div>

                    )}

                    <div className="admin-music-info">

                      <strong>
                        {musica.titulo}
                      </strong>

                      <span>
                        {musica.artista}
                      </span>

                      <small>

                        Pedido por{" "}

                        <b>
                          {musica.nickname ||
                            "Cliente"}
                        </b>

                      </small>

                    </div>

                    <div className="admin-music-actions">

                      <button
                        type="button"
                        className="play-button"
                        disabled={processando}
                        onClick={() =>
                          tocarMusica(
                            musica.id
                          )
                        }
                        title="Tocar agora"
                      >
                        ▶
                      </button>

                      <button
                        type="button"
                        className="remove-button"
                        disabled={processando}
                        onClick={() =>
                          removerMusica(
                            musica.id
                          )
                        }
                        title="Remover"
                      >
                        ×
                      </button>

                    </div>

                  </article>

                )
              )}

            </div>

          )}

        </section>

        {/* ==================================================
            FOTOS PENDENTES
        ================================================== */}

        <section className="admin-card">

          <div className="admin-section-header">

            <div>

              <span>
                SOCIAL WALL
              </span>

              <h2>
                Fotos pendentes
              </h2>

            </div>

            <strong className="queue-count">
              {fotos.length}
            </strong>

          </div>

          <p className="admin-photo-description">
            Aprove apenas fotos que podem ser
            exibidas publicamente na TV do lounge.
          </p>

          {fotos.length === 0 ? (

            <div className="admin-empty">

              <span>
                📷
              </span>

              Nenhuma foto aguardando aprovação.

            </div>

          ) : (

            <div className="admin-photo-grid">

              {fotos.map(
                (foto) => (

                  <article
                    className="admin-photo-card"
                    key={foto.id}
                  >

                    <div className="admin-photo-image">

                      <img
                        src={foto.arquivo_url}
                        alt="Foto enviada"
                      />

                    </div>

                    <div className="admin-photo-info">

                      <span>
                        Enviada por
                      </span>

                      <strong>
                        {foto.nickname ||
                          "Cliente"}
                      </strong>

                    </div>

                    <div className="admin-photo-actions">

                      <button
                        type="button"
                        className="approve-photo-button"
                        disabled={
                          processandoFoto !== null
                        }
                        onClick={() =>
                          alterarFoto(
                            foto.id,
                            "aprovada"
                          )
                        }
                      >
                        {processandoFoto ===
                        foto.id
                          ? "..."
                          : "✓ Aprovar"}
                      </button>

                      <button
                        type="button"
                        className="reject-photo-button"
                        disabled={
                          processandoFoto !== null
                        }
                        onClick={() =>
                          alterarFoto(
                            foto.id,
                            "rejeitada"
                          )
                        }
                      >
                        × Rejeitar
                      </button>

                    </div>

                  </article>

                )
              )}

            </div>

          )}

        </section>

      </main>

    </div>
  );
}