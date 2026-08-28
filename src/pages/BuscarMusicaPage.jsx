import { useState } from "react";
import { useNavigate } from "react-router";

import { supabase } from "../lib/supabase";

export default function BuscarMusicaPage() {
  const navigate = useNavigate();

  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);

  const [buscando, setBuscando] = useState(false);
  const [adicionando, setAdicionando] = useState(null);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const youtubeKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  // ======================================================
  // BUSCAR NO YOUTUBE
  // ======================================================

  async function buscarMusicas(event) {
    event.preventDefault();

    const termo = busca.trim();

    if (termo.length < 2) {
      setErro("Digite o nome da música ou artista.");
      return;
    }

    if (!youtubeKey) {
      setErro(
        "A chave da API do YouTube não está configurada."
      );
      return;
    }

    setErro("");
    setMensagem("");
    setBuscando(true);
    setResultados([]);

    try {
      const parametros = new URLSearchParams({
        part: "snippet",
        type: "video",
        maxResults: "10",
        q: termo,
        key: youtubeKey,
      });

      const resposta = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${parametros}`
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro YouTube:", dados);

        throw new Error(
          dados?.error?.message ||
            "Não foi possível pesquisar no YouTube."
        );
      }

      const videos = (dados.items || []).map((item) => ({
        videoId: item.id.videoId,
        titulo: item.snippet.title,
        canal: item.snippet.channelTitle,
        thumbnail:
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
      }));

      setResultados(videos);

      if (videos.length === 0) {
        setMensagem("Nenhuma música encontrada.");
      }
    } catch (error) {
      console.error(error);

      setErro(
        error.message ||
          "Não foi possível realizar a pesquisa."
      );
    } finally {
      setBuscando(false);
    }
  }

  // ======================================================
  // ADICIONAR À FILA
  // ======================================================

  async function adicionarMusica(video) {
    const token = localStorage.getItem(
      "narguileaju_token"
    );

    if (!token) {
      navigate("/");
      return;
    }

    setErro("");
    setMensagem("");
    setAdicionando(video.videoId);

    try {
      // Primeiro precisamos descobrir a sala atual.
      const { data: estado, error: estadoError } =
        await supabase.rpc("estado_cliente", {
          p_token: token,
          p_sala_codigo: "NARGUILEAJU",
        });

      if (estadoError) {
        throw estadoError;
      }

      if (!estado?.sucesso) {
        localStorage.removeItem(
          "narguileaju_token"
        );

        navigate("/");
        return;
      }

      if (estado.restantes <= 0) {
        throw new Error(
          "Você atingiu seu limite de músicas na fila."
        );
      }

      // Adiciona a música usando a função que criamos
      const { data, error } = await supabase.rpc(
        "pedir_musica",
        {
          p_token: token,
          p_sala_id: estado.sala_id,
          p_titulo: video.titulo,
          p_artista: video.canal,
          p_provider: "youtube",
          p_provider_id: video.videoId,
          p_thumbnail_url: video.thumbnail,
        }
      );

      if (error) {
        console.error(
          "Erro ao adicionar música:",
          error
        );

        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(
          data?.mensagem ||
            "Não foi possível adicionar a música."
        );
      }

      setMensagem(
        `"${video.titulo}" foi adicionada à fila.`
      );

      // Volta para a área do cliente depois de um pequeno
      // intervalo para ele visualizar a confirmação.
      setTimeout(() => {
        navigate("/cliente");
      }, 900);
    } catch (error) {
      console.error(error);

      setErro(
        error.message ||
          "Não foi possível adicionar a música."
      );
    } finally {
      setAdicionando(null);
    }
  }

  // ======================================================
  // INTERFACE
  // ======================================================

  return (
    <div className="buscar-page">

      <header className="buscar-header">

        <button
          type="button"
          className="voltar-button"
          onClick={() => navigate("/cliente")}
        >
          ←
        </button>

        <div>
          <span>🐪 NARGUILEAJU</span>
          <h1>Escolher música</h1>
        </div>

      </header>

      <main className="buscar-content">

        <form
          className="youtube-search"
          onSubmit={buscarMusicas}
        >

          <input
            type="search"
            placeholder="Música ou artista..."
            value={busca}
            onChange={(event) =>
              setBusca(event.target.value)
            }
            disabled={buscando}
          />

          <button
            type="submit"
            disabled={buscando}
          >
            {buscando ? "Buscando..." : "Buscar"}
          </button>

        </form>

        <p className="search-hint">
          Pesquise pelo nome da música ou artista.
        </p>

        {erro && (
          <div className="buscar-error">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="buscar-success">
            {mensagem}
          </div>
        )}

        <section className="youtube-results">

          {resultados.map((video) => (

            <article
              className="youtube-result"
              key={video.videoId}
            >

              <img
                src={video.thumbnail}
                alt=""
              />

              <div className="youtube-result-info">

                <strong>
                  {video.titulo}
                </strong>

                <span>
                  {video.canal}
                </span>

              </div>

              <button
                type="button"
                className="add-music-button"
                onClick={() =>
                  adicionarMusica(video)
                }
                disabled={
                  adicionando !== null
                }
                title="Adicionar à fila"
              >
                {adicionando === video.videoId
                  ? "..."
                  : "+"}
              </button>

            </article>

          ))}

        </section>

      </main>

    </div>
  );
}