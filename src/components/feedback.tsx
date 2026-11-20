import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import styles from './feedback.module.css';
import { ScrollRow } from './ui';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong while loading this.';
}

interface ErrorNoticeProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
}

export function ErrorNotice({ error, onRetry }: ErrorNoticeProps) {
  return (
    <div role="alert" className={styles.error}>
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyNotice({ children }: { readonly children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

/** Placeholder row of poster cards while data loads. */
export function CardRowSkeleton({ count = 6 }: { readonly count?: number }) {
  return (
    <ScrollRow aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.rowCard}>
          <span className={`${styles.block} ${styles.poster}`} />
          <span className={`${styles.block} ${styles.line}`} />
          <span className={`${styles.block} ${styles.lineShort}`} />
        </span>
      ))}
    </ScrollRow>
  );
}

/** Placeholder grid of poster cards while data loads. */
export function CardGridSkeleton({ count = 10 }: { readonly count?: number }) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i}>
          <span className={`${styles.block} ${styles.poster}`} />
          <span className={`${styles.block} ${styles.line}`} />
          <span className={`${styles.block} ${styles.lineShort}`} />
        </span>
      ))}
    </div>
  );
}

export function Block({ className }: { readonly className?: string }) {
  return <span aria-hidden="true" className={`${styles.block} ${className ?? ''}`} />;
}

export function LoadingStatus({ label = 'Loading…' }: { readonly label?: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

interface LoadMoreProps {
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onLoadMore: () => void;
  readonly label?: string;
}

export function LoadMore({ hasMore, loading, onLoadMore, label = 'Load more' }: LoadMoreProps) {
  if (!hasMore) return null;
  return (
    <div className={styles.loadMore}>
      <button type="button" className={styles.loadMoreButton} onClick={onLoadMore} disabled={loading}>
        {loading ? 'Loading…' : label}
      </button>
    </div>
  );
}
