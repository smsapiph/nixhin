import { useNavigate } from 'react-router';
import { useStore } from '../../hooks/useStore';
import { isFinished, progressStore, removeProgress, resumeEpisode, type WatchProgress } from '../../lib/progress';
import { itemKey, kindOf } from '../../lib/queueStorage';
import { animePath, moviePath, tvPath } from '../../routes';
import { ShowCard } from '../ShowCard';
import { Muted, ScrollRow, TitleLines } from '../ui';
import { HomeSection } from './HomeSections';
import styles from './ContinueWatching.module.css';

function progressLine(entry: WatchProgress, episode: number): string {
  if (entry.kind === 'movie') return 'Movie';
  if (entry.kind === 'tv') return `TV · S${entry.season ?? 1} · Episode ${episode}`;
  const parts = [`Episode ${episode}`];
  if (entry.language) parts.push(entry.language.toUpperCase());
  return parts.join(' · ');
}

/** Where a card resumes: the episode to open, as a path. */
function resumePath(entry: WatchProgress, episode: number): string {
  if (entry.kind === 'movie') return moviePath(entry.id);
  if (entry.kind === 'tv') return tvPath(entry.id, { season: entry.season ?? 1, episode });
  return animePath(entry.id, { episode, ...(entry.language && { language: entry.language }) });
}

function watchedLabel(entry: WatchProgress): string {
  if (entry.kind === 'movie') return entry.watched.length > 0 ? 'Watched' : 'Not finished';
  return entry.total && !entry.kind
    ? `${entry.watched.length} of ${entry.total} episodes watched`
    : `${entry.watched.length} episodes watched`;
}

/** Share of a title watched, for the progress bar (TV shows: unknown until opened, so none). */
function watchedShare(entry: WatchProgress): number {
  if (entry.kind === 'tv') return 0;
  return entry.total ? Math.min(1, entry.watched.length / entry.total) : 0;
}

/** Titles (anime, movies, TV shows) started on this device, most recent first, each resuming where it was left. */
export function ContinueWatching() {
  const navigate = useNavigate();
  const entries = useStore(progressStore).filter((entry) => !isFinished(entry));
  if (entries.length === 0) return null;

  return (
    <HomeSection
      id="continue"
      eyebrow="Continue watching · 続きから"
      title="Pick up where you left off"
      aside={<Muted>Saved on this device</Muted>}
    >
      <ScrollRow>
        {entries.map((entry) => {
          const episode = resumeEpisode(entry);
          const share = watchedShare(entry);
          const kind = kindOf(entry);
          return (
            <div key={itemKey(kind, entry.id)} className={styles.item}>
              <ShowCard anime={entry} layout="grid" onOpen={() => navigate(resumePath(entry, episode))}>
                <span className={styles.bar} role="img" aria-label={watchedLabel(entry)}>
                  <span className={styles.fill} style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                <TitleLines title={entry.title} subtitle={progressLine(entry, episode)} />
              </ShowCard>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${entry.title} from Continue watching`}
                title="Remove"
                onClick={() => progressStore.set((list) => removeProgress(list, entry.id, kind))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          );
        })}
      </ScrollRow>
    </HomeSection>
  );
}
