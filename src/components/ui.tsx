import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './ui.module.css';

function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return <span className={styles.eyebrow}>{children}</span>;
}

export function Muted({ children }: { readonly children: ReactNode }) {
  return <span className={styles.muted}>{children}</span>;
}

export function AccentDot({ size = '0.4em' }: { readonly size?: string }) {
  return <span aria-hidden="true" className={styles.dot} style={{ width: size, height: size }} />;
}

interface SectionHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly aside?: ReactNode;
  readonly headingId?: string;
}

export function SectionHeader({ eyebrow, title, aside, headingId }: SectionHeaderProps) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={headingId} className={styles.sectionTitle}>
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

export function TextLink({ className, ...props }: ComponentPropsWithoutRef<'a'>) {
  return <a className={cx(styles.textLink, className)} {...props} />;
}

type ButtonVariant = 'primary' | 'outline';

interface PillButtonProps extends ComponentPropsWithoutRef<'button'> {
  readonly variant?: ButtonVariant;
}

export function PillButton({ variant = 'primary', className, type = 'button', ...props }: PillButtonProps) {
  return <button type={type} className={cx(styles.pill, styles[variant], className)} {...props} />;
}

/** Horizontally scrolling row with scroll snapping. */
export function ScrollRow({ children, className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cx(styles.scrollRow, className)} {...props}>
      {children}
    </div>
  );
}

/** Title + subtitle text block used under posters. */
export function TitleLines({ title, subtitle }: { readonly title: string; readonly subtitle: string }) {
  return (
    <>
      <span className={styles.cardTitle}>{title}</span>
      <span className={styles.cardSubtitle}>{subtitle}</span>
    </>
  );
}
