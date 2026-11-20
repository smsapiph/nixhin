import type { AnimeDetail } from '../../../shared/api';
import { useStream } from '../../api/queries';
import { ErrorNotice, LoadingStatus } from '../feedback';
import styles from './TrailerPlayer.module.css';

interface EpisodePlayerProps {
  readonly anime: AnimeDetail;
  readonly episode: number;
  readonly language: string;
}

/** Only https embeds are ever framed, even though the server builds them from a fixed template. */
function safeEmbedUrl(url: string): string | null {
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Plays an episode through the server-configured provider's embed player.
 *
 * The frame is sandboxed without `allow-popups` or `allow-top-navigation`, so the embedded
 * page cannot open new windows or navigate Nixhin away (blocks pop-under/redirect behaviour).
 */
export function EpisodePlayer({ anime, episode, language }: EpisodePlayerProps) {
  const { data, isPending, isError, error, refetch } = useStream(anime.id, episode, language, true);
  const src = data ? safeEmbedUrl(data.embedUrl) : null;

  return (
    <div className={styles.player}>
      {isPending ? (
        <div className={styles.noTrailer}>
          <LoadingStatus label="Loading episode…" />
          Loading episode {episode}…
        </div>
      ) : isError ? (
        <div className={styles.noTrailer}>
          <ErrorNotice error={error} onRetry={() => void refetch()} />
        </div>
      ) : src ? (
        <iframe
          key={src}
          className={styles.iframe}
          src={src}
          title={`${anime.title} — episode ${episode} (${language})`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <p className={styles.noTrailer}>This episode can’t be played here.</p>
      )}
    </div>
  );
}
