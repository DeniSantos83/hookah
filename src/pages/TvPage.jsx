import { useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabase";

export default function TvPage() {
  // ======================================================
  // ESTADOS PRINCIPAIS
  // ======================================================

  const [estado, setEstado] = useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");

  const [playerPronto, setPlayerPronto] =
    useState(false);

  // ======================================================
  // FOTOS DA NOITE
  // ======================================================

  const [fotos, setFotos] =
    useState([]);

  const [
    fotoAtualIndex,
    setFotoAtualIndex,
  ] = useState(0);

  const [
    intervaloFotos,
    setIntervaloFotos,
  ] = useState(10);

  // ======================================================
  // REFERÊNCIAS DO PLAYER
  // ======================================================

  const playerRef =
    useRef(null);

  const playerReadyRef =
    useRef(false);

  const videoAtualRef =
    useRef(null);

  const musicaAtualRef =
    useRef(null);

  const finalizandoRef =
    useRef(false);

  // ======================================================
  // MANTÉM REFERÊNCIA DA MÚSICA ATUAL
  // ======================================================

  useEffect(() => {
    musicaAtualRef.current =
      estado?.tocando || null;
  }, [estado]);

  // ======================================================
  // ESTADO DA TV + FOTOS + REALTIME
  // ======================================================

  useEffect(() => {
    carregarEstado();
    carregarFotosTv();

    const canal = supabase
      .channel("tv-narguileaju")

      // --------------------------------------------------
      // FILA DE MÚSICAS
      // --------------------------------------------------

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fila_musicas",
        },
        () => {
          carregarEstado();
        }
      )

      // --------------------------------------------------
      // FOTOS
      // --------------------------------------------------

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fotos",
        },
        () => {
          carregarFotosTv();
        }
      )

      // --------------------------------------------------
      // CONFIGURAÇÕES DA SALA
      // --------------------------------------------------

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "configuracoes_sala",
        },
        () => {
          carregarFotosTv();
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(
        canal
      );
    };
  }, []);

  // ======================================================
  // ROTAÇÃO AUTOMÁTICA DAS FOTOS
  // ======================================================

  useEffect(() => {
    if (fotos.length <= 1) {
      setFotoAtualIndex(0);
      return;
    }

    const intervalo =
      setInterval(() => {
        setFotoAtualIndex(
          (indiceAtual) => {
            const proximo =
              indiceAtual + 1;

            if (
              proximo >=
              fotos.length
            ) {
              return 0;
            }

            return proximo;
          }
        );
      }, intervaloFotos * 1000);

    return () => {
      clearInterval(
        intervalo
      );
    };
  }, [
    fotos,
    intervaloFotos,
  ]);

  // ======================================================
  // CORRIGE ÍNDICE CASO A LISTA MUDE
  // ======================================================

  useEffect(() => {
    if (
      fotos.length === 0
    ) {
      setFotoAtualIndex(0);
      return;
    }

    if (
      fotoAtualIndex >=
      fotos.length
    ) {
      setFotoAtualIndex(0);
    }
  }, [
    fotos,
    fotoAtualIndex,
  ]);

  // ======================================================
  // CARREGA API DO YOUTUBE
  // ======================================================

  useEffect(() => {
    function iniciarYoutube() {
      if (
        window.YT?.Player
      ) {
        criarPlayer();
        return;
      }

      window.onYouTubeIframeAPIReady =
        () => {
          criarPlayer();
        };

      const scriptExistente =
        document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]'
        );

      if (!scriptExistente) {
        const script =
          document.createElement(
            "script"
          );

        script.src =
          "https://www.youtube.com/iframe_api";

        document.body.appendChild(
          script
        );
      }
    }

    iniciarYoutube();
  }, []);

  // ======================================================
  // CLEANUP DO PLAYER
  // ======================================================

  useEffect(() => {
    return () => {
      try {
        if (
          playerRef.current &&
          typeof playerRef
            .current
            .destroy ===
            "function"
        ) {
          playerRef.current.destroy();
        }
      } catch (error) {
        console.warn(
          "Não foi possível destruir o player:",
          error
        );
      }

      playerRef.current =
        null;

      playerReadyRef.current =
        false;
    };
  }, []);

  // ======================================================
  // QUANDO A MÚSICA MUDA
  // ======================================================

  useEffect(() => {
    const videoId =
      estado?.tocando
        ?.provider_id;

    // --------------------------------------------------
    // NÃO HÁ MÚSICA TOCANDO
    // --------------------------------------------------

    if (!videoId) {
      videoAtualRef.current =
        null;

      if (
        playerReadyRef.current &&
        playerRef.current &&
        typeof playerRef
          .current
          .stopVideo ===
          "function"
      ) {
        try {
          playerRef.current.stopVideo();
        } catch {
          // ignora
        }
      }

      return;
    }

    // --------------------------------------------------
    // PLAYER AINDA NÃO ESTÁ PRONTO
    // --------------------------------------------------

    if (
      !playerReadyRef.current ||
      !playerRef.current
    ) {
      return;
    }

    // --------------------------------------------------
    // JÁ É O MESMO VÍDEO
    // --------------------------------------------------

    if (
      videoAtualRef.current ===
      videoId
    ) {
      return;
    }

    carregarVideo(videoId);

  }, [estado]);

  // ======================================================
  // BUSCAR ESTADO MUSICAL NO SUPABASE
  // ======================================================

  async function carregarEstado() {
    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "estado_tv",
        {
          p_sala_codigo:
            "NARGUILEAJU",
        }
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem ||
            "Não foi possível carregar a TV."
        );
      }

      setEstado(data);

      setErro("");

    } catch (error) {
      console.error(
        "Erro ao carregar estado da TV:",
        error
      );

      setErro(
        "Não foi possível carregar a programação."
      );

    } finally {
      setCarregando(false);
    }
  }

  // ======================================================
  // CARREGAR FOTOS APROVADAS
  // ======================================================

  async function carregarFotosTv() {
    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "fotos_tv",
        {
          p_sala_codigo:
            "NARGUILEAJU",
        }
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        console.warn(
          "Não foi possível carregar fotos:",
          data?.mensagem
        );

        return;
      }

      setFotos(
        data?.fotos || []
      );

      setIntervaloFotos(
        data?.intervalo_segundos ||
          10
      );

    } catch (error) {
      console.error(
        "Erro ao carregar fotos da TV:",
        error
      );
    }
  }

  // ======================================================
  // CRIAR PLAYER
  // ======================================================

  function criarPlayer() {
    if (
      playerRef.current
    ) {
      return;
    }

    if (
      !window.YT?.Player
    ) {
      return;
    }

    const container =
      document.getElementById(
        "youtube-player"
      );

    if (!container) {
      setTimeout(() => {
        criarPlayer();
      }, 200);

      return;
    }

    try {
      playerRef.current =
        new window.YT.Player(
          "youtube-player",
          {
            width:
              "100%",

            height:
              "100%",

            playerVars: {
              autoplay: 1,

              controls: 1,

              playsinline: 1,

              rel: 0,

              disablekb: 0,
            },

            events: {
              onReady:
                handlePlayerReady,

              onStateChange:
                handlePlayerStateChange,

              onError:
                handlePlayerError,

              onAutoplayBlocked:
                handleAutoplayBlocked,
            },
          }
        );

    } catch (error) {
      console.error(
        "Erro ao criar player do YouTube:",
        error
      );

      playerRef.current =
        null;

      setTimeout(() => {
        criarPlayer();
      }, 500);
    }
  }

  // ======================================================
  // PLAYER PRONTO
  // ======================================================

  function handlePlayerReady() {
    playerReadyRef.current =
      true;

    setPlayerPronto(true);

    const musica =
      musicaAtualRef.current;

    const videoId =
      musica?.provider_id;

    if (!videoId) {
      return;
    }

    carregarVideo(
      videoId
    );
  }

  // ======================================================
  // CARREGAR VÍDEO
  // ======================================================

  function carregarVideo(
    videoId
  ) {
    if (
      !videoId ||
      !playerReadyRef.current ||
      !playerRef.current
    ) {
      return;
    }

    try {
      videoAtualRef.current =
        videoId;

      playerRef.current
        .loadVideoById(
          videoId
        );

    } catch (error) {
      console.error(
        "Erro ao carregar vídeo:",
        error
      );
    }
  }

  // ======================================================
  // AUTOPLAY BLOQUEADO
  // ======================================================

  function handleAutoplayBlocked() {
    console.log(
      "Autoplay bloqueado pelo navegador. " +
        "É necessário dar Play uma vez."
    );
  }

  // ======================================================
  // ERRO DO YOUTUBE
  // ======================================================

  function handlePlayerError(
    event
  ) {
    console.error(
      "Erro do YouTube Player:",
      event.data
    );

    setErro(
      "Não foi possível reproduzir este vídeo."
    );
  }

  // ======================================================
  // QUANDO O VÍDEO TERMINA
  // ======================================================

  async function handlePlayerStateChange(
    event
  ) {
    if (!window.YT) {
      return;
    }

    if (
      event.data !==
      window.YT.PlayerState
        .ENDED
    ) {
      return;
    }

    if (
      finalizandoRef.current
    ) {
      return;
    }

    const musica =
      musicaAtualRef.current;

    if (!musica?.id) {
      return;
    }

    finalizandoRef.current =
      true;

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        "tv_musica_finalizada",
        {
          p_sala_codigo:
            "NARGUILEAJU",

          p_musica_id:
            musica.id,
        }
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem ||
            "Não foi possível avançar a fila."
        );
      }

      videoAtualRef.current =
        null;

      await carregarEstado();

    } catch (error) {
      console.error(
        "Erro ao finalizar música:",
        error
      );

    } finally {
      finalizandoRef.current =
        false;
    }
  }

  // ======================================================
  // DADOS ATUAIS
  // ======================================================

  const tocando =
    estado?.tocando ||
    null;

  const proxima =
    estado?.proxima ||
    null;

  const fotoAtual =
    fotos.length > 0
      ? fotos[
          fotoAtualIndex
        ]
      : null;

  // ======================================================
  // INTERFACE
  // ======================================================

  return (
    <div className="tv-page">

      {/* ==================================================
          CABEÇALHO
      ================================================== */}

      <header className="tv-header">

        <div>

          <span>
            🐪 NARGUILEAJU
          </span>

          <h1>
            Lounge Jukebox
          </h1>

        </div>

        <div className="tv-live">

          <span></span>

          AO VIVO

        </div>

      </header>

      {/* ERRO */}

      {erro && (
        <div className="tv-error">
          {erro}
        </div>
      )}

      <main className="tv-layout">

        {/* ==================================================
            PLAYER
        ================================================== */}

        <section className="tv-player-area">

          <div className="youtube-wrapper">

            <div
              id="youtube-player"
              className="youtube-player"
            />

            {/* SEM MÚSICA */}

            {!tocando && (
              <div className="tv-player-overlay">

                <div className="tv-empty">

                  <div>
                    ♫
                  </div>

                  <h2>
                    Aguardando música
                  </h2>

                  <p>
                    Escolha uma música
                    pelo QR Code.
                  </p>

                </div>

              </div>
            )}

            {/* CARREGAMENTO */}

            {carregando && (
              <div className="tv-player-overlay">

                <div className="tv-empty">

                  <div>
                    🐪
                  </div>

                  <h2>
                    Preparando Jukebox
                  </h2>

                </div>

              </div>
            )}

          </div>

        </section>

        {/* ==================================================
            BARRA LATERAL
        ================================================== */}

        <aside className="tv-sidebar">

          {/* ================================================
              TOCANDO AGORA
          ================================================ */}

          <section className="tv-info-card">

            <span className="tv-label">
              TOCANDO AGORA
            </span>

            {tocando ? (

              <>

                {tocando.thumbnail_url && (
                  <img
                    className="tv-cover"
                    src={
                      tocando
                        .thumbnail_url
                    }
                    alt=""
                  />
                )}

                <h2>
                  {tocando.titulo}
                </h2>

                <p>
                  {tocando.artista}
                </p>

                {!playerPronto && (
                  <small className="tv-player-status">
                    Preparando
                    player...
                  </small>
                )}

              </>

            ) : (

              <div className="tv-no-song">
                Nenhuma música tocando
              </div>

            )}

          </section>

          {/* ================================================
              PRÓXIMA MÚSICA
          ================================================ */}

          <section className="tv-info-card next-song-card">

            <span className="tv-label">
              PRÓXIMA
            </span>

            {proxima ? (

              <div className="tv-next">

                {proxima.thumbnail_url && (
                  <img
                    src={
                      proxima
                        .thumbnail_url
                    }
                    alt=""
                  />
                )}

                <div>

                  <strong>
                    {proxima.titulo}
                  </strong>

                  <span>
                    {proxima.artista}
                  </span>

                </div>

              </div>

            ) : (

              <div className="tv-no-song">
                Fila vazia
              </div>

            )}

          </section>

          {/* ================================================
              SOCIAL WALL
          ================================================ */}

          <section className="tv-social-wall">

            <div className="tv-social-header">

              <div>

                <span className="tv-label">
                  FOTOS DA NOITE
                </span>

                <strong>
                  Narguileaju
                </strong>

              </div>

              {fotos.length > 0 && (
                <span className="tv-photo-counter">

                  {fotoAtualIndex + 1}

                  {" / "}

                  {fotos.length}

                </span>
              )}

            </div>

            {fotoAtual ? (

              <div className="tv-photo-stage">

                <img
                  key={
                    fotoAtual.id
                  }
                  src={
                    fotoAtual
                      .arquivo_url
                  }
                  alt="Foto da noite"
                />

                <div className="tv-photo-overlay">

                  <span>
                    📷 Compartilhe
                    seu momento
                  </span>

                </div>

              </div>

            ) : (

              <div className="tv-social-empty">

                <span>
                  📷
                </span>

                <strong>
                  Fotos da noite
                </strong>

                <small>
                  Envie uma foto
                  pelo QR Code
                </small>

              </div>

            )}

          </section>

        </aside>

      </main>

    </div>
  );
}