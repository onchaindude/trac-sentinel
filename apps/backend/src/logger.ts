import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  serializers: {
    // Trim Axios errors down to the essentials — avoids logging full req/res objects
    err: (err: unknown) => {
      if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        return {
          type:    e.type    ?? e.name,
          message: e.message,
          code:    e.code,
          status:  (e.response as Record<string, unknown>)?.status,
          data:    (e.response as Record<string, unknown>)?.data,
          stack:   typeof e.stack === 'string' ? e.stack.split('\n').slice(0, 4).join('\n') : undefined,
        };
      }
      return err;
    },
  },
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, ignore: 'pid,hostname' },
  },
});
