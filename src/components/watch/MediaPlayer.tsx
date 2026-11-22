import { Fragment, useRef } from 'react';
import type { MediaDetail } from '../../../shared/api';
import { useMediaStream } from '../../api/media';
import { useDevtoolsOpen } from '../../hooks/useDevtoolsOpen';
import { safeEmbedUrl } from '../../lib/embed';
import { isTv } from '../../lib/tvDevice';
import { mediaControlKey } from '../../lib/tvPlayer';
import { ErrorNotice, LoadingStatus } from '../feedback';
import styles from './TrailerPlayer.module.css';
import { TvFrameFocus } from './TvFrameFocus';

interface MediaPlayerProps {
  readonly detail: MediaDetail;
  /** TV only. */
  readonly season: number | null;
  readonly episode: number | null;
}

/** Plays a movie or a TV episode through the server-configured provider (like EpisodePlayer for anime). */
export function MediaPlayer({ detail, season, episode }: MediaPlayerProps) {
  const { data, isPending, isError, error, refetch } = useMediaStream(detail.kind, detail.id, season, episode, true);
  const src = data ? safeEmbedUrl(data.token) : null;
  const devtoolsOpen = useDevtoolsOpen();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const label = detail.kind === 'tv' ? `S${season ?? 1} · Episode ${episode ?? 1}` : 'the movie';

  return (
    <div className={styles.player}>
      {isPending ? (
        <div className={styles.noTrailer}>
          <LoadingStatus label={`Loading ${label}…`} />
          Loading {label}…
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
            title={detail.kind === 'tv' ? `${detail.title} — ${label}` : detail.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          {isTv && <TvFrameFocus frameRef={frameRef} requestKey={mediaControlKey(detail.kind, season, episode)} />}
        </Fragment>
      ) : (
        <p className={styles.noTrailer}>This title can’t be played here.</p>
      )}
    </div>
  );
}
