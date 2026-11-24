import type { MangaSummary } from '../../shared/api';
import { useMangaList } from '../api/manga';
import { HomeSection } from '../components/home/HomeSections';
import { MangaCard, MangaGrid, MangaRowSection } from '../components/manga/MangaCards';
import { flattenPages } from '../lib/mangaFormat';
import { Muted, ScrollRow, TitleLines } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStore } from '../hooks/useStore';
import { chapterNumber, LANGUAGE_LABELS } from '../lib/mangaChapters';
import { mangaProgressStore, removeReading } from '../lib/mangaProgress';
import { mangaPath, mangaReaderPath } from '../routes';
import continueStyles from '../components/home/ContinueWatching.module.css';
import styles from './HomePage.module.css';

const hrefFor = (manga: MangaSummary) => mangaPath(manga.id);

/** Home of the Manga mode: where the reader left off, then MangaDex's lists. */
export function MangaHomePage() {
  useDocumentTitle('Manga');
  const popular = useMangaList('popular');
  const rated = useMangaList('top');
  const fresh = useMangaList('new');
  const latest = useMangaList('latest');
  const latestItems = flattenPages(latest.data?.pages);

  return (
    <main id="top" className={styles.page}>
      <ContinueReading />
      <MangaRowSection
        id="popular"
        eyebrow="Popular · 人気"
        title="Most followed"
        items={popular.data?.pages[0]?.items ?? []}
        isPending={popular.isPending}
        error={popular.error}
        onRetry={() => void popular.refetch()}
        hrefFor={hrefFor}
        ranked
      />
      <MangaRowSection
        id="rated"
        eyebrow="Top rated · 高評価"
        title="Highest rated"
        items={rated.data?.pages[0]?.items ?? []}
        isPending={rated.isPending}
        error={rated.error}
        onRetry={() => void rated.refetch()}
        hrefFor={hrefFor}
      />
      <MangaRowSection
        id="new"
        eyebrow="New · 新作"
        title="Recently added"
        items={fresh.data?.pages[0]?.items ?? []}
        isPending={fresh.isPending}
        error={fresh.error}
        onRetry={() => void fresh.refetch()}
        hrefFor={hrefFor}
      />
      <HomeSection id="latest" eyebrow="Latest updates · 更新" title="New chapters in English or Filipino" busy={latest.isPending}>
        <MangaGrid
          items={latestItems}
          isPending={latest.isPending}
          error={latest.error}
          onRetry={() => void latest.refetch()}
          hasMore={latest.hasNextPage}
          loadingMore={latest.isFetchingNextPage}
          onLoadMore={() => void latest.fetchNextPage()}
          empty="No recent updates."
          hrefFor={hrefFor}
        />
      </HomeSection>
    </main>
  );
}

/** "Continue reading": the last chapter opened in each manga, newest first. Hidden when empty. */
function ContinueReading() {
  const items = useStore(mangaProgressStore);
  if (items.length === 0) return null;
  return (
    <HomeSection
      id="continue"
      eyebrow="Continue reading · 続きを読む"
      title="Pick up where you left off"
      aside={<Muted>Saved on this device</Muted>}
    >
      <ScrollRow>
        {items.map((entry) => (
          <div key={entry.id} className={continueStyles.item}>
            <MangaCard href={mangaReaderPath(entry.id, entry.chapterId)} title={entry.title} coverUrl={entry.coverUrl} layout="grid">
              <TitleLines
                title={entry.title}
                subtitle={`${chapterNumber({ chapter: entry.chapter, volume: null, title: null })} · ${LANGUAGE_LABELS[entry.language]}`}
              />
            </MangaCard>
            {/* Same × as Continue watching on the anime, movie and TV homes. */}
            <button
              type="button"
              className={continueStyles.remove}
              aria-label={`Remove ${entry.title} from Continue reading`}
              title="Remove"
              onClick={() => mangaProgressStore.set((list) => removeReading(list, entry.id))}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </ScrollRow>
    </HomeSection>
  );
}
