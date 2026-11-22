import { useNavigate } from 'react-router';
import { useStore } from '../../hooks/useStore';
import { isFinished, progressStore, removeProgress, resumeEpisode, type WatchProgress } from '../../lib/progress';
import { animePath } from '../../routes';
import { ShowCard } from '../ShowCard';
import { Muted, ScrollRow, TitleLines } from '../ui';
import { HomeSection } from './HomeSections';
import styles from './ContinueWatching.module.css';

function progressLine(entry: WatchProgress, episode: number): string {
  const parts = [`Episode ${episode}`];
  if (entry.language) parts.push(entry.language.toUpperCase());
  return parts.join(' · ');
}

/** Shows started on this device, most recent first, each resuming where it was left. */
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
          const share = entry.total ? Math.min(1, entry.watched.length / entry.total) : 0;
          return (
            <div key={entry.id} className={styles.item}>
              <ShowCard
                anime={entry}
                layout="grid"
                onOpen={() => navigate(animePath(entry.id, { episode, ...(entry.language && { language: entry.language }) }))}
              >
                <span
                  className={styles.bar}
                  role="img"
                  aria-label={
                    entry.total
                      ? `${entry.watched.length} of ${entry.total} episodes watched`
                      : `${entry.watched.length} episodes watched`
                  }
                >
                  <span className={styles.fill} style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                <TitleLines title={entry.title} subtitle={progressLine(entry, episode)} />
              </ShowCard>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${entry.title} from Continue watching`}
                title="Remove"
                onClick={() => progressStore.set((list) => removeProgress(list, entry.id))}
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
