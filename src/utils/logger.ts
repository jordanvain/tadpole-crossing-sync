import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from './config';

// Ensure log directory exists before transports are created
fs.mkdirSync(config.paths.logs, { recursive: true });

export const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${message}${extras}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(config.paths.logs, 'sync-error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(config.paths.logs, 'sync.log'),
    }),
  ],
});
