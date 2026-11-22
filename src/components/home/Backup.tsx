import { useId, useState, type ChangeEvent } from 'react';
import { backupFileName, createBackup, importBackup, MAX_BACKUP_BYTES, parseBackup } from '../../lib/backup';
import styles from './Backup.module.css';

/**
 * Export / import of everything kept on this device (queue, progress, searches, preferences),
 * so a viewer can move to another browser or keep a copy without an account.
 */
export function Backup() {
  const inputId = useId();
  const [message, setMessage] = useState('');

  const exportData = () => {
    const blob = new Blob([JSON.stringify(createBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName();
    document.body.append(link);
    link.click();
    link.remove();
    // Some browsers start the download asynchronously.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Backup downloaded. Import it on another device to bring your list along.');
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setMessage('That file is too large to be a Nixhin backup.');
      return;
    }
    const backup = parseBackup(await file.text());
    if (!backup) {
      setMessage('That file isn’t a Nixhin backup.');
      return;
    }
    const { queueAdded, showsTracked } = importBackup(backup);
    setMessage(
      `Imported. ${queueAdded} ${queueAdded === 1 ? 'show' : 'shows'} added to your queue; ` +
        `progress for ${showsTracked} ${showsTracked === 1 ? 'show' : 'shows'} on this device.`,
    );
  };

  return (
    <div className={styles.backup}>
      <p className={styles.text}>
        Your queue and watch progress live only in this browser. Back them up, or move them to another device.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={exportData}>
          Export backup
        </button>
        {/* Visually hidden; its label is the visible button. Kept first so the label can show its focus. */}
        <input
          id={inputId}
          type="file"
          accept="application/json,.json"
          className={`sr-only ${styles.file}`}
          onChange={(event) => void importData(event)}
        />
        <label htmlFor={inputId} className={styles.button}>
          Import backup
        </label>
      </div>
      <p role="status" className={styles.message}>
        {message}
      </p>
    </div>
  );
}
