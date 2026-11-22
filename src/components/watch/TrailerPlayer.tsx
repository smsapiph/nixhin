import { useRef, useState } from 'react';
import type { Trailer } from '../../../shared/api';
import { isTv } from '../../lib/tvDevice';
import { Icon } from '../Icon';
import { TvFrameFocus } from './TvFrameFocus';
import styles from './TrailerPlayer.module.css';

/** Strict check before building an embed URL, even though the API already validates it. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** What the trailer player needs: an anime, or a movie/show with its backdrop as `bannerUrl`. */
export interface TrailerSource {
  readonly title: string;
  readonly trailer: Trailer | null;
  readonly bannerUrl: string | null;
  readonly imageUrlLarge: string | null;
  readonly imageUrl: string | null;
}

/**
 * Click-to-load YouTube trailer. The iframe (and YouTube's scripts/cookies) only load
 * after the viewer asks for it, using the privacy-enhanced youtube-nocookie domain.
 */
export function TrailerPlayer({ anime }: { readonly anime: TrailerSource }) {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const youtubeId = anime.trailer && YOUTUBE_ID.test(anime.trailer.youtubeId) ? anime.trailer.youtubeId : null;
  // The trailer's own 16:9 thumbnail fits the player best; otherwise fall back to the show's artwork.
  const thumbnail = youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null;
  const still = thumbnail ?? anime.bannerUrl ?? anime.imageUrlLarge ?? anime.imageUrl;
  const dimmed = thumbnail === null && anime.bannerUrl === null;

  if (youtubeId && playing) {
    return (
      <div className={styles.player}>
        <iframe
          ref={frameRef}
          className={styles.iframe}
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0`}
          title={`${anime.title} — trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
        {/* "Play trailer" was just pressed and is gone: keep the remote on the video. */}
        {isTv && <TvFrameFocus frameRef={frameRef} autoFocus />}
      </div>
    );
  }

  return (
    <div className={styles.player}>
      {still && (
        <img
          className={dimmed ? styles.stillDimmed : styles.still}
          src={still}
          alt=""
          referrerPolicy="no-referrer"
        />
      )}
      {youtubeId ? (
        <button type="button" className={styles.playButton} onClick={() => setPlaying(true)}>
          <span className={styles.playIcon}>
            <Icon name="bigPlay" size="1.5em" />
          </span>
          <span className={styles.playLabel}>Play trailer</span>
        </button>
      ) : (
        <p className={styles.noTrailer}>No trailer available for this title.</p>
      )}
    </div>
  );
}
