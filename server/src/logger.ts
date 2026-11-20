type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Structured JSON-lines logger. Never pass secrets or full request bodies in `fields`. */
export function createLogger(minLevel: Level = 'info'): Logger {
  const write = (level: Level) => (message: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
