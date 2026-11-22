import { Fragment, useRef } from 'react';
import type { AnimeDetail } from '../../../shared/api';
import { decodeStreamToken } from '../../../shared/streamToken';
import { useStream } from '../../api/queries';
import { useDevtoolsOpen } from '../../hooks/useDevtoolsOpen';
import { isTv } from '../../lib/tvDevice';
import { episodeControlKey } from '../../lib/tvPlayer';
import { ErrorNotice, LoadingStatus } from '../feedback';
import { TvFrameFocus } from './TvFrameFocus';
import styles from './TrailerPlayer.module.css';

interface EpisodePlayerProps {
  readonly anime: AnimeDetail;
  readonly episode: number;
  readonly language: string;
}

/**
 * Decodes the server's stream token. Only https embeds are ever framed, even though the
 * server builds them from a fixed template.
 */
function safeEmbedUrl(token: string): string | null {
  const url = decodeStreamToken(token);
  if (url === null) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Plays an episode through the server-configured provider's embed player.
 *
 * The frame is not sandboxed: the provider page runs with its normal permissions.
 * The frame is removed while DevTools appears to be open.
 */
export function EpisodePlayer({ anime, episode, language }: EpisodePlayerProps) {
  const { data, isPending, isError, error, refetch } = useStream(anime.id, episode, language, true);
  const src = data ? safeEmbedUrl(data.token) : null;
  // The frame is unmounted (not hidden) while DevTools is open, and comes back when it closes.
  const devtoolsOpen = useDevtoolsOpen();
  const frameRef = useRef<HTMLIFrameElement>(null);

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
      ) : devtoolsOpen ? (
        <p className={styles.noTrailer}>Close developer tools to keep watching.</p>
      ) : src ? (
        <Fragment key={src}>
          <iframe
            ref={frameRef}
            className={styles.iframe}
            src={src}
            title={`${anime.title} — episode ${episode} (${language})`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          {isTv && <TvFrameFocus frameRef={frameRef} requestKey={episodeControlKey(episode, language)} />}
        </Fragment>
      ) : (
        <p className={styles.noTrailer}>This episode can’t be played here.</p>
      )}
    </div>
  );
}
