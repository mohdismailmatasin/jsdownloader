import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import os from 'os';

class Logger {
    constructor(config) {
        this.config = config;
        this.logger = null;
        this.init();
    }

    init() {
        const logDir = path.join(os.homedir(), this.config.get('logging', 'logDirectory'));

        // Ensure log directory exists
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const transports = [
            // Console transport with colors
            new winston.transports.Console({
                level: this.config.get('logging', 'level'),
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp({ format: 'HH:mm:ss' }),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        let metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                        return `${timestamp} [${level}]: ${message} ${metaStr}`;
                    })
                )
            })
        ];

        // Add file transport if enabled
        if (this.config.get('logging', 'enableFileLogging')) {
            transports.push(
                new DailyRotateFile({
                    filename: path.join(logDir, 'jsdownloader-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    maxSize: `${this.config.get('logging', 'maxFileSize')}m`,
                    maxFiles: this.config.get('logging', 'maxFiles'),
                    level: this.config.get('logging', 'level'),
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json()
                    )
                })
            );
        }

        this.logger = winston.createLogger({
            level: this.config.get('logging', 'level'),
            transports
        });
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    logDownloadStart(url, destination) {
        this.info('Download started', {
            url,
            destination,
            timestamp: new Date().toISOString()
        });
    }

    logDownloadComplete(url, destination, stats) {
        this.info('Download completed', {
            url,
            destination,
            ...stats,
            timestamp: new Date().toISOString()
        });
    }

    logDownloadError(url, error) {
        this.error('Download failed', {
            url,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }

    logDownloadProgress(url, progress) {
        this.debug('Download progress', {
            url,
            progress,
            timestamp: new Date().toISOString()
        });
    }
}

export default Logger;
