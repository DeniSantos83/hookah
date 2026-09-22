import { useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabase";

export default function TvPage() {
  // ======================================================
  // ESTADOS PRINCIPAIS
  // ======================================================

  const [estado, setEstado] = useState(null);

  const [carregando, setCarregando] = useState(true);

  const [erro, setErro] = useState("");

  const [, setPlayerPronto] = useState(false);

  // ======================================================
  // LIKES AO VIVO
  // ======================================================

  const [animacaoLike, setAnimacaoLike] = useState(null);

  const likesMusicaRef = useRef({ musicaId: null, total: 0 });

  const timerLikeRef = useRef(null);

  // ======================================================
  // FOTOS DA NOITE
  // ======================================================

  const [fotos, setFotos] = useState([]);

  const [fotoAtualIndex, setFotoAtualIndex] = useState(0);

  const [intervaloFotos, setIntervaloFotos] = useState(10);

  // ======================================================
  // RANKING DOS DJs
  // ======================================================

  const [rankingNoite, setRankingNoite] = useState([]);
  const [rankingMes, setRankingMes] = useState([]);
  const [periodoRanking, setPeriodoRanking] = useState("noite");

  // ======================================================
  // REFERÊNCIAS DO PLAYER
  // ======================================================

  const playerRef = useRef(null);

  const playerReadyRef = useRef(false);

  const videoAtualRef = useRef(null);

  const musicaAtualRef = useRef(null);

  const finalizandoRef = useRef(false);

  // ======================================================
  // MANTÉM REFERÊNCIA DA MÚSICA ATUAL
  // ======================================================

  useEffect(() => {
    musicaAtualRef.current = estado?.tocando || null;
  }, [estado]);

  // ======================================================
  // ESTADO DA TV + FOTOS + REALTIME
  // ======================================================

  useEffect(() => {
    carregarEstado();
    carregarFotosTv();
    carregarRankings();

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
        },
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
        },
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
          carregarEstado();
          carregarFotosTv();
        },
      )

      // --------------------------------------------------
      // LIKES DAS MÚSICAS
      // --------------------------------------------------

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "likes_musicas",
        },
        () => {
          carregarEstado(true);
          carregarRankings();
        },
      )

      .subscribe();

    return () => {
      supabase.removeChannel(canal);

      if (timerLikeRef.current) {
        clearTimeout(timerLikeRef.current);
      }
    };
  }, []);

  // ======================================================
  // SINCRONIZAÇÃO LEVE DA TV
  // ======================================================
  // Consulta o estado a cada 2 segundos para atualizar likes
  // e o card "Próxima música". O player não reinicia porque
  // carregarVideo() já ignora o mesmo provider_id.
  useEffect(() => {
    const intervaloTv = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        carregarEstado(false);
      }
    }, 2000);

    return () => {
      window.clearInterval(intervaloTv);
    };
  }, []);

  // ======================================================
  // ATUALIZAÇÃO E ALTERNÂNCIA DO RANKING
  // ======================================================

  useEffect(() => {
    const intervaloRanking = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        carregarRankings();
      }
    }, 10000);

    return () => {
      window.clearInterval(intervaloRanking);
    };
  }, []);

  useEffect(() => {
    const alternarRanking = window.setInterval(() => {
      setPeriodoRanking((periodoAtual) =>
        periodoAtual === "noite" ? "mes" : "noite",
      );
    }, 12000);

    return () => {
      window.clearInterval(alternarRanking);
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

    const intervalo = setInterval(() => {
      setFotoAtualIndex((indiceAtual) => {
        const proximo = indiceAtual + 1;

        if (proximo >= fotos.length) {
          return 0;
        }

        return proximo;
      });
    }, intervaloFotos * 1000);

    return () => {
      clearInterval(intervalo);
    };
  }, [fotos, intervaloFotos]);

  // ======================================================
  // CORRIGE ÍNDICE CASO A LISTA MUDE
  // ======================================================

  useEffect(() => {
    if (fotos.length === 0) {
      setFotoAtualIndex(0);
      return;
    }

    if (fotoAtualIndex >= fotos.length) {
      setFotoAtualIndex(0);
    }
  }, [fotos, fotoAtualIndex]);

  // ======================================================
  // CARREGA API DO YOUTUBE
  // ======================================================

  useEffect(() => {
    function iniciarYoutube() {
      if (window.YT?.Player) {
        criarPlayer();
        return;
      }

      window.onYouTubeIframeAPIReady = () => {
        criarPlayer();
      };

      const scriptExistente = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      );

      if (!scriptExistente) {
        const script = document.createElement("script");

        script.src = "https://www.youtube.com/iframe_api";

        document.body.appendChild(script);
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
          typeof playerRef.current.destroy === "function"
        ) {
          playerRef.current.destroy();
        }
      } catch (error) {
        console.warn("Não foi possível destruir o player:", error);
      }

      playerRef.current = null;

      playerReadyRef.current = false;
    };
  }, []);

  // ======================================================
  // QUANDO A MÚSICA MUDA
  // ======================================================

  useEffect(() => {
    const videoId = estado?.tocando?.provider_id;

    // --------------------------------------------------
    // NÃO HÁ MÚSICA TOCANDO
    // --------------------------------------------------

    if (!videoId) {
      videoAtualRef.current = null;

      if (
        playerReadyRef.current &&
        playerRef.current &&
        typeof playerRef.current.stopVideo === "function"
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

    if (!playerReadyRef.current || !playerRef.current) {
      return;
    }

    // --------------------------------------------------
    // JÁ É O MESMO VÍDEO
    // --------------------------------------------------

    if (videoAtualRef.current === videoId) {
      return;
    }

    carregarVideo(videoId);
  }, [estado]);

  // ======================================================
  // BUSCAR ESTADO MUSICAL NO SUPABASE
  // ======================================================

  async function carregarEstado(animarNovoLike = false) {
    try {
      const { data, error } = await supabase.rpc("estado_tv", {
        p_sala_codigo: "NARGUILEAJU",
      });

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(data?.mensagem || "Não foi possível carregar a TV.");
      }

      const musicaId = data?.tocando?.id || null;

      const totalLikes = Number(data?.tocando?.likes || 0);

      const anterior = likesMusicaRef.current;

      // Só anima quando chegou um novo like para a MESMA
      // música que já estava sendo acompanhada pela TV.
      // Assim, abrir/recarregar a TV não dispara a animação.
      if (
        animarNovoLike &&
        musicaId &&
        anterior.musicaId === musicaId &&
        totalLikes > anterior.total
      ) {
        const quantidadeNova = totalLikes - anterior.total;

        setAnimacaoLike({
          id: `${musicaId}-${Date.now()}`,
          quantidade: quantidadeNova,
          total: totalLikes,
        });

        if (timerLikeRef.current) {
          clearTimeout(timerLikeRef.current);
        }

        timerLikeRef.current = setTimeout(() => {
          setAnimacaoLike(null);
        }, 2200);
      }

      likesMusicaRef.current = {
        musicaId,
        total: totalLikes,
      };

      setEstado(data);

      setErro("");
    } catch (error) {
      console.error("Erro ao carregar estado da TV:", error);

      setErro("Não foi possível carregar a programação.");
    } finally {
      setCarregando(false);
    }
  }

  // ======================================================
  // CARREGAR TOP 3 DOS DJs
  // ======================================================

  async function carregarRankings() {
    try {
      const [resultadoNoite, resultadoMes] = await Promise.all([
        supabase.rpc("ranking_djs", {
          p_sala_codigo: "NARGUILEAJU",
          p_periodo: "noite",
          p_limite: 3,
        }),
        supabase.rpc("ranking_djs", {
          p_sala_codigo: "NARGUILEAJU",
          p_periodo: "mes",
          p_limite: 3,
        }),
      ]);

      if (resultadoNoite.error) {
        throw resultadoNoite.error;
      }

      if (resultadoMes.error) {
        throw resultadoMes.error;
      }

      if (resultadoNoite.data?.sucesso) {
        setRankingNoite(resultadoNoite.data?.ranking || []);
      }

      if (resultadoMes.data?.sucesso) {
        setRankingMes(resultadoMes.data?.ranking || []);
      }
    } catch (error) {
      console.error("Erro ao carregar ranking dos DJs:", error);
    }
  }

  // ======================================================
  // CARREGAR FOTOS APROVADAS
  // ======================================================

  async function carregarFotosTv() {
    try {
      const { data, error } = await supabase.rpc("fotos_tv", {
        p_sala_codigo: "NARGUILEAJU",
      });

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        console.warn("Não foi possível carregar fotos:", data?.mensagem);

        return;
      }

      setFotos(data?.fotos || []);

      setIntervaloFotos(data?.intervalo_segundos || 10);
    } catch (error) {
      console.error("Erro ao carregar fotos da TV:", error);
    }
  }

  // ======================================================
  // CRIAR PLAYER
  // ======================================================

  function criarPlayer() {
    if (playerRef.current) {
      return;
    }

    if (!window.YT?.Player) {
      return;
    }

    const container = document.getElementById("youtube-player");

    if (!container) {
      setTimeout(() => {
        criarPlayer();
      }, 200);

      return;
    }

    try {
      playerRef.current = new window.YT.Player("youtube-player", {
        width: "100%",

        height: "100%",

        playerVars: {
          autoplay: 1,

          controls: 1,

          playsinline: 1,

          rel: 0,

          disablekb: 0,
        },

        events: {
          onReady: handlePlayerReady,

          onStateChange: handlePlayerStateChange,

          onError: handlePlayerError,

          onAutoplayBlocked: handleAutoplayBlocked,
        },
      });
    } catch (error) {
      console.error("Erro ao criar player do YouTube:", error);

      playerRef.current = null;

      setTimeout(() => {
        criarPlayer();
      }, 500);
    }
  }

  // ======================================================
  // PLAYER PRONTO
  // ======================================================

  function handlePlayerReady() {
    playerReadyRef.current = true;

    setPlayerPronto(true);

    const musica = musicaAtualRef.current;

    const videoId = musica?.provider_id;

    if (!videoId) {
      return;
    }

    carregarVideo(videoId);
  }

  // ======================================================
  // CARREGAR VÍDEO
  // ======================================================

  function carregarVideo(videoId) {
    if (!videoId || !playerReadyRef.current || !playerRef.current) {
      return;
    }

    try {
      videoAtualRef.current = videoId;

      playerRef.current.loadVideoById(videoId);
    } catch (error) {
      console.error("Erro ao carregar vídeo:", error);
    }
  }

  // ======================================================
  // AUTOPLAY BLOQUEADO
  // ======================================================

  function handleAutoplayBlocked() {
    console.log(
      "Autoplay bloqueado pelo navegador. " + "É necessário dar Play uma vez.",
    );
  }

  // ======================================================
  // ERRO DO YOUTUBE
  // ======================================================

  function handlePlayerError(event) {
    console.error("Erro do YouTube Player:", event.data);

    setErro("Não foi possível reproduzir este vídeo.");
  }

  // ======================================================
  // QUANDO O VÍDEO TERMINA
  // ======================================================

  async function handlePlayerStateChange(event) {
    if (!window.YT) {
      return;
    }

    if (event.data !== window.YT.PlayerState.ENDED) {
      return;
    }

    if (finalizandoRef.current) {
      return;
    }

    const musica = musicaAtualRef.current;

    if (!musica?.id) {
      return;
    }

    finalizandoRef.current = true;

    try {
      const { data, error } = await supabase.rpc("tv_musica_finalizada", {
        p_sala_codigo: "NARGUILEAJU",

        p_musica_id: musica.id,
      });

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(data?.mensagem || "Não foi possível avançar a fila.");
      }

      videoAtualRef.current = null;

      await carregarEstado();
    } catch (error) {
      console.error("Erro ao finalizar música:", error);
    } finally {
      finalizandoRef.current = false;
    }
  }

  // ======================================================
  // DADOS ATUAIS
  // ======================================================

  const tocando = estado?.tocando || null;

  const proxima = estado?.proxima || null;

  const fotoAtual = fotos.length > 0 ? fotos[fotoAtualIndex] : null;

  const mensagemTv = estado?.mensagem_tv?.trim() || "";

  const mensagemTvAtiva = Boolean(estado?.mensagem_tv_ativa && mensagemTv);

  const rankingAtual = periodoRanking === "noite" ? rankingNoite : rankingMes;

  const tituloRanking =
    periodoRanking === "noite" ? "TOP DJs DA NOITE" : "TOP DJs DO MÊS";

  // ======================================================
  // INTERFACE
  // ======================================================

  return (
    <div className="tv-page tv-kiosk">
      {/* ==================================================
          PLAYER EM TELA CHEIA
      ================================================== */}

      <main className="tv-stage">
        <div className="youtube-wrapper tv-youtube-full">
          <div id="youtube-player" className="youtube-player" />

          {/* SEM MÚSICA */}

          {!tocando && !carregando && (
            <div className="tv-player-overlay">
              <div className="tv-empty">
                <div>♫</div>

                <h2>Aguardando música</h2>

                <p>Escolha uma música pelo QR Code.</p>
              </div>
            </div>
          )}

          {/* CARREGAMENTO */}

          {carregando && (
            <div className="tv-player-overlay">
              <div className="tv-empty">
                <div>🐪</div>

                <h2>Preparando Jukebox</h2>
              </div>
            </div>
          )}
        </div>

        {/* ==================================================
            MARCA / AO VIVO
        ================================================== */}

        <div className="tv-floating-brand">
          <span>🐪 NARGUILEAJU</span>

          <strong>LOUNGE JUKEBOX</strong>

          <small>
            <i></i>
            AO VIVO
          </small>
        </div>

        {/* ==================================================
            TOP 3 DJs - NÃO INTERFERE NO PLAYER
        ================================================== */}

        {rankingAtual.length > 0 && (
          <section className="tv-dj-ranking">
            <div className="tv-dj-ranking-header">
              <span>🏆 {tituloRanking}</span>
              <small>{periodoRanking === "noite" ? "HOJE" : "MÊS"}</small>
            </div>

            <div className="tv-dj-ranking-list">
              {rankingAtual.slice(0, 3).map((dj, index) => (
                <div
                  key={`${periodoRanking}-${dj.cliente_id}`}
                  className={`tv-dj-ranking-item tv-dj-position-${index + 1}`}
                >
                  <span className="tv-dj-medal">
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                  </span>

                  <strong>{dj.nickname || "Cliente"}</strong>

                  <span className="tv-dj-likes">
                    👍 {Number(dj.likes || 0)}
                  </span>
                </div>
              ))}
            </div>

            <small className="tv-dj-ranking-call">
              Quem será o DJ nº 1? 🎧
            </small>
          </section>
        )}

        {/* ==================================================
            LIKES DA MÚSICA TOCANDO
        ================================================== */}

        {tocando && (
          <div className="tv-current-likes">
            <span>👍</span>
            <strong>{Number(tocando.likes || 0)}</strong>
            <small>LIKES</small>
          </div>
        )}

        {/* Animação exibida somente quando entra um novo like */}
        {animacaoLike && (
          <div
            key={animacaoLike.id}
            className="tv-like-burst"
            aria-live="polite"
          >
            <div className="tv-like-burst-hand">👍</div>
            <strong>
              +{animacaoLike.quantidade} LIKE
              {animacaoLike.quantidade > 1 ? "S" : ""}
            </strong>
            <span>{animacaoLike.total} LIKES</span>
          </div>
        )}

        {/* ==================================================
            PRÓXIMA MÚSICA - FLUTUANTE
        ================================================== */}

        <section className="tv-floating-next">
          <span className="tv-floating-label">PRÓXIMA MÚSICA</span>

          {proxima ? (
            <div className="tv-floating-next-content">
              {proxima.thumbnail_url && (
                <img src={proxima.thumbnail_url} alt="" />
              )}

              <div>
                <strong>{proxima.titulo}</strong>

                <span>{proxima.artista}</span>

                <small>
                  Escolhida por <b>{proxima.nickname || "Cliente"}</b>
                </small>

                <small className="tv-next-likes">
                  👍 {Number(proxima.likes || 0)}
                  {Number(proxima.likes || 0) === 1 ? " like" : " likes"}
                </small>
              </div>
            </div>
          ) : (
            <div className="tv-floating-empty">Fila vazia</div>
          )}
        </section>

        {/* ==================================================
            LETREIRO DO TELÃO
        ================================================== */}

        {mensagemTvAtiva && (
          <div className="tv-ticker" aria-label="Mensagem do telão">
            <div className="tv-ticker-track">
              <span className="tv-ticker-item">
                <b>📢</b>
                {mensagemTv}
                <i>•</i>
              </span>

              <span className="tv-ticker-item" aria-hidden="true">
                <b>📢</b>
                {mensagemTv}
                <i>•</i>
              </span>

              <span className="tv-ticker-item" aria-hidden="true">
                <b>📢</b>
                {mensagemTv}
                <i>•</i>
              </span>
            </div>
          </div>
        )}

        {/* ==================================================
            FOTO DA NOITE - FLUTUANTE
        ================================================== */}

        <section className="tv-floating-photo">
          <div className="tv-floating-photo-header">
            <div>
              <span className="tv-floating-label">FOTOS DA NOITE</span>

              <strong>Narguileaju</strong>
            </div>

            {fotos.length > 0 && (
              <span className="tv-floating-counter">
                {fotoAtualIndex + 1}

                {" / "}

                {fotos.length}
              </span>
            )}
          </div>

          {fotoAtual ? (
            <div className="tv-floating-photo-stage">
              <img
                key={fotoAtual.id}
                src={fotoAtual.arquivo_url}
                alt="Foto da noite"
              />

              <div className="tv-floating-photo-caption">
                📷 Compartilhe seu momento
              </div>
            </div>
          ) : (
            <div className="tv-floating-photo-empty">
              <span>📷</span>

              <strong>Fotos da noite</strong>

              <small>Envie uma foto pelo QR Code</small>
            </div>
          )}
        </section>

        {/* ==================================================
            ERRO
        ================================================== */}

        {erro && <div className="tv-floating-error">{erro}</div>}
      </main>
    </div>
  );
}
