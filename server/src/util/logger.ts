const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const DEFAULT_LEVEL = 20;

function ts(): string {
  return new Date().toISOString();
}

function shouldLog(level: string): boolean {
  const configured = LEVELS[process.env.LOG_LEVEL ?? 'info'];
  const current = configured === undefined ? DEFAULT_LEVEL : configured;
  const event = LEVELS[level];
  const target = event === undefined ? DEFAULT_LEVEL : event;
  return target >= current;
}

function write(level: string, msg: string, meta?: unknown): void {
  if (!shouldLog(level)) return;
  const line = `${ts()} [${level.toUpperCase()}] ${msg}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : 'log'](line, meta === null || typeof meta !== 'object' ? meta : JSON.stringify(meta));
  } else {
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : 'log'](line);
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => write('debug', msg, meta),
  info: (msg: string, meta?: unknown) => write('info', msg, meta),
  warn: (msg: string, meta?: unknown) => write('warn', msg, meta),
  error: (msg: string, meta?: unknown) => write('error', msg, meta),
};
