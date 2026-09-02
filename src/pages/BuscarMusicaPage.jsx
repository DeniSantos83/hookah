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

  const [limiteDuracao, setLimiteDuracao] = useState(null);

  const youtubeKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  // ======================================================
  // DURAÇÃO DO YOUTUBE
  // ======================================================

  function duracaoIsoParaSegundos(duracao) {
    if (!duracao) {
      return 0;
    }

    const correspondencia = duracao.match(
      /P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
    );

    if (!correspondencia) {
      return 0;
    }

    const dias = Number(correspondencia[1] || 0);
    const horas = Number(correspondencia[2] || 0);
    const minutos = Number(correspondencia[3] || 0);
    const segundos = Number(correspondencia[4] || 0);

    return dias * 86400 + horas * 3600 + minutos * 60 + segundos;
  }

  function formatarDuracao(totalSegundos) {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;

    if (horas > 0) {
      return `${horas}:${String(minutos).padStart(2, "0")}:${String(
        segundos
      ).padStart(2, "0")}`;
    }

    return `${minutos}:${String(segundos).padStart(2, "0")}`;
  }

  function formatarLimite(segundos) {
    if (segundos == null) {
      return "sem limite";
    }

    if (segundos >= 3600) {
      const horas = segundos / 3600;
      return horas === 1 ? "1 hora" : `${horas} horas`;
    }

    return `${Math.round(segundos / 60)} minutos`;
  }

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

      const token = localStorage.getItem(
        "narguileaju_token"
      );

      if (!token) {
        navigate("/");
        return;
      }

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

      const limiteAtual =
        estado.duracao_maxima_segundos ?? null;

      setLimiteDuracao(limiteAtual);

      const itensBusca = dados.items || [];

      if (itensBusca.length === 0) {
        setResultados([]);
        setMensagem("Nenhuma música encontrada.");
        return;
      }

      const ids = itensBusca
        .map((item) => item.id.videoId)
        .filter(Boolean);

      const parametrosDetalhes = new URLSearchParams({
        part: "contentDetails",
        id: ids.join(","),
        key: youtubeKey,
      });

      const respostaDetalhes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${parametrosDetalhes}`
      );

      const dadosDetalhes = await respostaDetalhes.json();

      if (!respostaDetalhes.ok) {
        console.error(
          "Erro YouTube detalhes:",
          dadosDetalhes
        );

        throw new Error(
          dadosDetalhes?.error?.message ||
            "Não foi possível consultar a duração dos vídeos."
        );
      }

      const duracoesPorId = new Map(
        (dadosDetalhes.items || []).map((item) => [
          item.id,
          duracaoIsoParaSegundos(item.contentDetails?.duration),
        ])
      );

      const videos = itensBusca.map((item) => {
        const duracaoSegundos =
          duracoesPorId.get(item.id.videoId) || 0;

        const bloqueadoPorDuracao =
          limiteAtual != null &&
          duracaoSegundos > limiteAtual;

        return {
          videoId: item.id.videoId,
          titulo: item.snippet.title,
          canal: item.snippet.channelTitle,
          thumbnail:
            item.snippet.thumbnails?.medium?.url ||
            item.snippet.thumbnails?.default?.url ||
            "",
          duracaoSegundos,
          duracaoFormatada: formatarDuracao(duracaoSegundos),
          bloqueadoPorDuracao,
        };
      });

      setResultados(videos);
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
    if (video.bloqueadoPorDuracao) {
      setErro(
        `Este vídeo tem ${video.duracaoFormatada}. ` +
          `O limite atual é de ${formatarLimite(limiteDuracao)}.`
      );
      return;
    }

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
          {limiteDuracao != null && (
            <>
              {" "}
              Limite atual:{" "}
              <strong>
                {formatarLimite(limiteDuracao)}
              </strong>.
            </>
          )}
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

                <small
                  className={
                    video.bloqueadoPorDuracao
                      ? "video-duration video-duration-blocked"
                      : "video-duration"
                  }
                >
                  ⏱ {video.duracaoFormatada}
                  {video.bloqueadoPorDuracao &&
                    " • Acima do limite"}
                </small>

              </div>

              <button
                type="button"
                className="add-music-button"
                onClick={() =>
                  adicionarMusica(video)
                }
                disabled={
                  adicionando !== null ||
                  video.bloqueadoPorDuracao
                }
                title={
                  video.bloqueadoPorDuracao
                    ? `Limite atual: ${formatarLimite(limiteDuracao)}`
                    : "Adicionar à fila"
                }
              >
                {adicionando === video.videoId
                  ? "..."
                  : video.bloqueadoPorDuracao
                    ? "×"
                    : "+"}
              </button>

            </article>

          ))}

        </section>

      </main>

    </div>
  );
}