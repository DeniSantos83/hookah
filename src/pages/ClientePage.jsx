import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { supabase } from "../lib/supabase";

export default function ClientePage() {
  const navigate = useNavigate();

  const inputFotoRef = useRef(null);

  const [carregando, setCarregando] = useState(true);
  const [cliente, setCliente] = useState(null);
  const [musicas, setMusicas] = useState([]);
  const [filaGeral, setFilaGeral] = useState([]);
  const [curtindoId, setCurtindoId] = useState(null);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [enviandoFoto, setEnviandoFoto] = useState(false);

  // ======================================================
  // INICIALIZAÇÃO + REALTIME
  // ======================================================

  useEffect(() => {
    carregarPagina();

    const canal = supabase
      .channel("cliente-narguileaju")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fila_musicas",
        },
        () => {
          carregarFilaGeral();
        },
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "configuracoes_sala",
        },
        () => {
          carregarPagina(false);
        },
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "likes_musicas",
        },
        () => {
          carregarFilaGeral();
        },
      )

      .subscribe();

    // Fallback leve: atualiza somente a fila/likes a cada 5 segundos.
    // Não recarrega a página e não interfere no restante da interface.
    const intervaloFila = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        carregarFilaGeral();
      }
    }, 5000);

    // Ao voltar para a aba/janela, sincroniza a fila imediatamente.
    const atualizarAoVoltar = () => {
      if (document.visibilityState === "visible") {
        carregarFilaGeral();
      }
    };

    document.addEventListener("visibilitychange", atualizarAoVoltar);
    window.addEventListener("focus", atualizarAoVoltar);

    return () => {
      supabase.removeChannel(canal);
      window.clearInterval(intervaloFila);
      document.removeEventListener("visibilitychange", atualizarAoVoltar);
      window.removeEventListener("focus", atualizarAoVoltar);
    };
  }, []);

  // ======================================================
  // ATUALIZA SOMENTE A FILA DA GALERA + LIKES
  // ======================================================

  async function carregarFilaGeral() {
    const token = localStorage.getItem("narguileaju_token");

    if (!token) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc("fila_com_likes_cliente", {
        p_token: token,
        p_sala_codigo: "NARGUILEAJU",
      });

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        if (data?.erro === "SESSAO_INVALIDA") {
          limparSessao();
          navigate("/");
          return;
        }

        throw new Error(
          data?.mensagem || "Não foi possível atualizar a fila da galera.",
        );
      }

      // Atualiza apenas os cards de Tocando Agora / Próximas músicas.
      setFilaGeral(data?.fila || []);
    } catch (error) {
      console.error("Erro ao atualizar fila da galera:", error);
    }
  }

  // ======================================================
  // CARREGA ESTADO + MÚSICAS
  // ======================================================

  async function carregarPagina(mostrarCarregamento = true) {
    const token = localStorage.getItem("narguileaju_token");

    if (!token) {
      navigate("/");
      return;
    }

    if (mostrarCarregamento) {
      setCarregando(true);
    }

    try {
      // --------------------------------------------------
      // ESTADO
      // --------------------------------------------------

      const { data: estado, error: estadoError } = await supabase.rpc(
        "estado_cliente",
        {
          p_token: token,
          p_sala_codigo: "NARGUILEAJU",
        },
      );

      if (estadoError) {
        throw estadoError;
      }

      if (!estado?.sucesso) {
        limparSessao();
        navigate("/");
        return;
      }

      setCliente(estado);
      // --------------------------------------------------
      // FILA GERAL + LIKES
      // --------------------------------------------------

      const { data: filaLikes, error: filaLikesError } = await supabase.rpc(
        "fila_com_likes_cliente",
        {
          p_token: token,
          p_sala_codigo: "NARGUILEAJU",
        },
      );

      if (filaLikesError) {
        throw filaLikesError;
      }

      if (!filaLikes?.sucesso) {
        if (filaLikes?.erro === "SESSAO_INVALIDA") {
          limparSessao();
          navigate("/");
          return;
        }

        throw new Error(
          filaLikes?.mensagem || "Não foi possível carregar a fila da galera.",
        );
      }

      setFilaGeral(filaLikes?.fila || []);

      // --------------------------------------------------
      // MÚSICAS
      // --------------------------------------------------

      const { data: musicasData, error: musicasError } = await supabase.rpc(
        "minhas_musicas",
        {
          p_token: token,
          p_sala_codigo: "NARGUILEAJU",
        },
      );

      if (musicasError) {
        throw musicasError;
      }

      if (!musicasData?.sucesso) {
        if (musicasData?.erro === "SESSAO_INVALIDA") {
          limparSessao();
          navigate("/");
          return;
        }

        throw new Error(
          musicasData?.mensagem || "Não foi possível carregar suas músicas.",
        );
      }

      setMusicas(musicasData?.musicas || []);

      setErro("");
    } catch (error) {
      console.error("Erro ao carregar página:", error);

      setErro("Não foi possível carregar seus dados.");
    } finally {
      setCarregando(false);
    }
  }

  // ======================================================
  // LIMPAR SESSÃO
  // ======================================================

  function limparSessao() {
    localStorage.removeItem("narguileaju_token");

    localStorage.removeItem("narguileaju_cliente_id");

    localStorage.removeItem("narguileaju_nickname");
  }

  // ======================================================
  // SAIR
  // ======================================================

  async function sair() {
    const clienteId = localStorage.getItem("narguileaju_cliente_id");

    try {
      // Registra a saída antes de apagar a identificação do navegador.
      if (clienteId) {
        const { error } = await supabase.rpc("encerrar_sessao_cliente", {
          p_cliente_id: clienteId,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      // Mesmo se a conexão falhar, o cliente ainda consegue sair do Jukebox.
      console.error("Não foi possível encerrar a sessão do lounge:", error);
    } finally {
      limparSessao();
      navigate("/");
    }
  }

  // ======================================================
  // ESCOLHER MÚSICA
  // ======================================================

  function escolherMusica() {
    if ((cliente?.restantes ?? 0) <= 0) {
      return;
    }

    navigate("/buscar");
  }

  // ======================================================
  // CURTIR MÚSICA
  // ======================================================

  async function curtirMusica(musica) {
    if (
      !musica ||
      musica.minha_musica ||
      musica.curtido_por_mim ||
      curtindoId
    ) {
      return;
    }

    const clienteId =
      cliente?.cliente_id || localStorage.getItem("narguileaju_cliente_id");

    if (!clienteId) {
      setErro("Não foi possível identificar seu perfil.");
      return;
    }

    setCurtindoId(musica.id);
    setErro("");
    setMensagem("");

    try {
      const { data, error } = await supabase.rpc("curtir_musica", {
        p_sala_codigo: "NARGUILEAJU",
        p_fila_musica_id: musica.id,
        p_cliente_votante_id: clienteId,
      });

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        if (data?.erro === "LIKE_DUPLICADO") {
          await carregarFilaGeral();
          return;
        }

        throw new Error(
          data?.mensagem || "Não foi possível registrar seu like.",
        );
      }

      // Atualização imediata no aparelho que votou.
      setFilaGeral((filaAtual) =>
        filaAtual.map((item) =>
          item.id === musica.id
            ? {
                ...item,
                likes: data?.likes_musica ?? (item.likes ?? 0) + 1,
                curtido_por_mim: true,
              }
            : item,
        ),
      );
    } catch (error) {
      console.error("Erro ao curtir música:", error);
      setErro(error.message || "Não foi possível registrar seu like.");
    } finally {
      setCurtindoId(null);
    }
  }

  // ======================================================
  // ABRIR SELETOR DE FOTO
  // ======================================================

  function abrirSeletorFoto() {
    if (enviandoFoto) {
      return;
    }

    setErro("");
    setMensagem("");

    inputFotoRef.current?.click();
  }

  // ======================================================
  // ENVIAR FOTO
  // ======================================================

  async function selecionarFoto(event) {
    const arquivo = event.target.files?.[0];

    // Permite selecionar a mesma foto novamente
    event.target.value = "";

    if (!arquivo) {
      return;
    }

    const token = localStorage.getItem("narguileaju_token");

    const clienteId = localStorage.getItem("narguileaju_cliente_id");

    if (!token || !clienteId) {
      limparSessao();
      navigate("/");
      return;
    }

    // --------------------------------------------------
    // VALIDA TIPO
    // --------------------------------------------------

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

    if (!tiposPermitidos.includes(arquivo.type)) {
      setErro("Escolha uma imagem JPG, PNG ou WEBP.");

      return;
    }

    // --------------------------------------------------
    // LIMITE DE TAMANHO: 10 MB
    // --------------------------------------------------

    const limiteBytes = 10 * 1024 * 1024;

    if (arquivo.size > limiteBytes) {
      setErro("A imagem pode ter no máximo 10 MB.");

      return;
    }

    setEnviandoFoto(true);
    setErro("");
    setMensagem("");

    try {
      // ------------------------------------------------
      // EXTENSÃO
      // ------------------------------------------------

      const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";

      // ------------------------------------------------
      // NOME ÚNICO
      // ------------------------------------------------

      const identificador = crypto.randomUUID();

      const storagePath = `${clienteId}/${Date.now()}-${identificador}.${extensao}`;

      // ------------------------------------------------
      // UPLOAD
      // ------------------------------------------------

      const { error: uploadError } = await supabase.storage
        .from("fotos-noite")
        .upload(storagePath, arquivo, {
          cacheControl: "3600",
          upsert: false,
          contentType: arquivo.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      // ------------------------------------------------
      // URL PÚBLICA
      // ------------------------------------------------

      const { data: publicUrlData } = supabase.storage
        .from("fotos-noite")
        .getPublicUrl(storagePath);

      const arquivoUrl = publicUrlData?.publicUrl;

      if (!arquivoUrl) {
        throw new Error("Não foi possível gerar a URL da foto.");
      }

      // ------------------------------------------------
      // REGISTRA NO BANCO
      // ------------------------------------------------

      const { data, error } = await supabase.rpc("registrar_foto_cliente", {
        p_token: token,

        p_sala_codigo: "NARGUILEAJU",

        p_storage_path: storagePath,

        p_arquivo_url: arquivoUrl,

        p_nome_original: arquivo.name,
      });

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem || "Não foi possível registrar sua foto.",
        );
      }

      setMensagem("Foto enviada! Ela aparecerá na TV após aprovação.");
    } catch (error) {
      console.error("Erro ao enviar foto:", error);

      setErro(error.message || "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  // ======================================================
  // STATUS DA MÚSICA
  // ======================================================

  function obterStatus(status) {
    switch (status) {
      case "aguardando":
        return {
          icone: "⏳",
          texto: "Na fila",
          classe: "status-waiting",
        };

      case "tocando":
        return {
          icone: "▶",
          texto: "Tocando agora",
          classe: "status-playing",
        };

      case "tocada":
        return {
          icone: "✓",
          texto: "Tocada",
          classe: "status-played",
        };

      default:
        return {
          icone: "•",
          texto: status,
          classe: "",
        };
    }
  }

  const tocandoAgora = filaGeral.find((musica) => musica.status === "tocando");
  const filaAguardando = filaGeral.filter(
    (musica) => musica.status === "aguardando",
  );

  // ======================================================
  // CARREGAMENTO
  // ======================================================

  if (carregando) {
    return (
      <div className="cliente-loading">
        <div className="camel">🐪</div>

        <p>Carregando...</p>
      </div>
    );
  }

  // ======================================================
  // INTERFACE
  // ======================================================

  return (
    <div className="cliente-page">
      {/* INPUT OCULTO PARA FOTO */}

      <input
        ref={inputFotoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={selecionarFoto}
        className="hidden-photo-input"
      />

      {/* CABEÇALHO */}

      <header className="cliente-header">
        <div>
          <span className="cliente-logo">🐪 NARGUILEAJU</span>

          <h1>Olá, {cliente?.nickname}</h1>

          <p>Escolha o som da noite.</p>
        </div>

        <button
          type="button"
          className="logout-button"
          onClick={sair}
          title="Sair"
          aria-label="Sair"
        >
          ↪
        </button>
      </header>

      <main className="cliente-content">
        {/* ERRO */}

        {erro && <div className="cliente-error">{erro}</div>}

        {/* SUCESSO */}

        {mensagem && <div className="cliente-success">{mensagem}</div>}

        {/* LIMITE */}

        <section className="music-limit-card">
          <div className="music-limit-icon">♫</div>

          <div className="music-limit-info">
            <span>SUAS MÚSICAS NA FILA</span>

            <strong>
              {cliente?.na_fila ?? 0}
              {" / "}
              {cliente?.limite ?? 0}
            </strong>
          </div>
        </section>

        {/* DISPONIBILIDADE */}

        <section className="availability-message">
          {(cliente?.restantes ?? 0) > 0 ? (
            <>
              Você pode adicionar <strong>{cliente?.restantes}</strong>
              {cliente?.restantes === 1 ? " música" : " músicas"}.
            </>
          ) : (
            <>
              Você atingiu seu limite.
              <br />
              <span>
                Assim que uma música tocar, você poderá escolher outra.
              </span>
            </>
          )}
        </section>

        {/* ESCOLHER MÚSICA */}

        <button
          type="button"
          className="cliente-action primary-action"
          onClick={escolherMusica}
          disabled={(cliente?.restantes ?? 0) <= 0}
        >
          <div className="action-icon">🔎</div>

          <div>
            <strong>Escolher música</strong>

            <span>
              {(cliente?.restantes ?? 0) > 0
                ? "Busque pelo nome ou artista"
                : "Seu limite foi atingido"}
            </span>
          </div>
        </button>

        {/* ==================================================
            TOCANDO AGORA + FILA DA GALERA
        ================================================== */}

        {filaGeral.length > 0 && (
          <section className="community-queue">
            {tocandoAgora && (
              <div className="community-now">
                <div className="section-title">
                  <div>
                    <span className="section-eyebrow">🔥 TOCANDO AGORA</span>
                    <h2>Som da galera</h2>
                  </div>
                </div>

                <article className="community-music-card community-playing-card">
                  <div className="community-thumbnail">
                    {tocandoAgora.thumbnail_url ? (
                      <img src={tocandoAgora.thumbnail_url} alt="" />
                    ) : (
                      <span>♫</span>
                    )}
                    <div className="playing-indicator">▶</div>
                  </div>

                  <div className="community-music-info">
                    <strong>{tocandoAgora.titulo}</strong>
                    <span>{tocandoAgora.artista}</span>
                    <small>
                      🎧 Escolhida por {tocandoAgora.nickname || "Cliente"}
                    </small>

                    <button
                      type="button"
                      className={`like-button ${
                        tocandoAgora.curtido_por_mim ? "liked" : ""
                      } ${tocandoAgora.minha_musica ? "own-song" : ""}`}
                      onClick={() => curtirMusica(tocandoAgora)}
                      disabled={
                        tocandoAgora.minha_musica ||
                        tocandoAgora.curtido_por_mim ||
                        curtindoId !== null
                      }
                    >
                      <span className="like-hand">👍</span>
                      <strong>{tocandoAgora.likes ?? 0}</strong>
                      <span>
                        {tocandoAgora.minha_musica
                          ? "Sua música"
                          : tocandoAgora.curtido_por_mim
                            ? "Curtido"
                            : curtindoId === tocandoAgora.id
                              ? "Curtindo..."
                              : "Curtir"}
                      </span>
                    </button>
                  </div>
                </article>
              </div>
            )}

            {filaAguardando.length > 0 && (
              <div className="community-waiting">
                <div className="section-title">
                  <div>
                    <span className="section-eyebrow">🎵 FILA DA GALERA</span>
                    <h2>Próximas músicas</h2>
                  </div>
                  <span className="music-count">{filaAguardando.length}</span>
                </div>

                <div className="community-music-list">
                  {filaAguardando.map((musica) => (
                    <article className="community-music-card" key={musica.id}>
                      <div className="community-thumbnail">
                        {musica.thumbnail_url ? (
                          <img src={musica.thumbnail_url} alt="" />
                        ) : (
                          <span>♫</span>
                        )}
                      </div>

                      <div className="community-music-info">
                        <strong>{musica.titulo}</strong>
                        <span>{musica.artista}</span>
                        <small>
                          🎧 Escolhida por {musica.nickname || "Cliente"}
                        </small>

                        <button
                          type="button"
                          className={`like-button ${musica.curtido_por_mim ? "liked" : ""} ${
                            musica.minha_musica ? "own-song" : ""
                          }`}
                          onClick={() => curtirMusica(musica)}
                          disabled={
                            musica.minha_musica ||
                            musica.curtido_por_mim ||
                            curtindoId !== null
                          }
                        >
                          <span className="like-hand">👍</span>
                          <strong>{musica.likes ?? 0}</strong>
                          <span>
                            {musica.minha_musica
                              ? "Sua música"
                              : musica.curtido_por_mim
                                ? "Curtido"
                                : curtindoId === musica.id
                                  ? "Curtindo..."
                                  : "Curtir"}
                          </span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ==================================================
            MINHAS MÚSICAS
        ================================================== */}

        <section className="minhas-musicas">
          <div className="section-title">
            <div>
              <span className="section-eyebrow">SUA SELEÇÃO</span>

              <h2>Minhas músicas</h2>
            </div>

            <span className="music-count">{musicas.length}</span>
          </div>

          {musicas.length === 0 ? (
            <div className="empty-music-list">
              <div className="empty-music-icon">♫</div>

              <strong>Sua fila está vazia</strong>

              <span>Escolha uma música para começar.</span>
            </div>
          ) : (
            <div className="my-music-list">
              {musicas.map((musica) => {
                const status = obterStatus(musica.status);

                return (
                  <article
                    className={`my-music-card ${
                      musica.status === "tocando" ? "music-playing" : ""
                    }`}
                    key={musica.id}
                  >
                    <div className="my-music-thumbnail">
                      {musica.thumbnail_url ? (
                        <img src={musica.thumbnail_url} alt="" />
                      ) : (
                        <span>♫</span>
                      )}

                      {musica.status === "tocando" && (
                        <div className="playing-indicator">▶</div>
                      )}
                    </div>

                    <div className="my-music-info">
                      <strong>{musica.titulo}</strong>

                      <span className="my-music-artist">{musica.artista}</span>

                      <span className={`music-status ${status.classe}`}>
                        {status.icone} {status.texto}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ==================================================
            FOTO
        ================================================== */}

        <button
          type="button"
          className="cliente-action secondary-action photo-action"
          onClick={abrirSeletorFoto}
          disabled={enviandoFoto}
        >
          <div className="action-icon">{enviandoFoto ? "⏳" : "📷"}</div>

          <div>
            <strong>{enviandoFoto ? "Enviando foto..." : "Enviar foto"}</strong>

            <span>
              {enviandoFoto
                ? "Aguarde um momento"
                : "Sua foto pode aparecer na TV"}
            </span>
          </div>
        </button>

        <p className="photo-warning">
          Fotos passam por aprovação antes de aparecer na TV.
        </p>

        {/* RODAPÉ */}

        <div className="cliente-footer">
          <span>🐪</span>
          Narguileaju
        </div>
      </main>
    </div>
  );
}
