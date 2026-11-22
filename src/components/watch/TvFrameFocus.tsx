import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { focusElement } from '../../lib/spatialNav';
import {
  enterPlayerMode,
  exitPlayerMode,
  isPlayerMode,
  subscribePlayerMode,
  takePlayerRequest,
} from '../../lib/tvPlayer';
import styles from './TvFrameFocus.module.css';

interface TvFrameFocusProps {
  readonly frameRef: RefObject<HTMLIFrameElement | null>;
  /** Names this video for `requestPlayerControl` (see lib/tvPlayer.ts). */
  readonly requestKey?: string;
  /** Focus the video as soon as it appears (e.g. right after "Play trailer"). */
  readonly autoFocus?: boolean;
}

/**
 * TV only: a focus target laid over a video iframe. Moving onto it with the remote highlights the
 * video; OK hands the remote to the player (see lib/tvPlayer.ts) until Back is pressed.
 * It ignores the pointer, so clicks still reach the player itself.
 */
export function TvFrameFocus({ frameRef, requestKey, autoFocus = false }: TvFrameFocusProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controlling = useSyncExternalStore(subscribePlayerMode, isPlayerMode, () => false);

  useEffect(() => {
    const button = buttonRef.current;
    const frame = frameRef.current;
    if (!button || !frame) return;

    // An episode was just picked from the list: go straight to the video.
    const takeRequest = () => {
      if (requestKey === undefined || !takePlayerRequest(requestKey)) return;
      focusElement(button);
      enterPlayerMode(frame, button);
    };
    // A pointer click put focus in the video: treat it like OK, so Back returns to the page.
    const onBlur = () =>
      window.setTimeout(() => {
        if (document.activeElement === frame) enterPlayerMode(frame, button, true);
      }, 0);

    if (autoFocus) focusElement(button);
    takeRequest();
    const unsubscribe = subscribePlayerMode(takeRequest);
    window.addEventListener('blur', onBlur);
    return () => {
      unsubscribe();
      window.removeEventListener('blur', onBlur);
      // Only once the video is really gone (React may re-run effects on a frame that stays).
      window.setTimeout(() => {
        if (!frame.isConnected) exitPlayerMode(frame);
      }, 0);
    };
  }, [frameRef, requestKey, autoFocus]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${styles.focus} ${controlling ? styles.controlling : ''}`}
      data-tv-autofocus=""
      aria-label="Control the video with the remote"
      onClick={() => {
        const frame = frameRef.current;
        if (frame && buttonRef.current) enterPlayerMode(frame, buttonRef.current);
      }}
    >
      <span className={styles.label} aria-hidden="true">
        Press OK to control the video
      </span>
    </button>
  );
}
