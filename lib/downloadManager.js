import fs from 'fs';
import path from 'path';
import HttpDownloader from './httpDownloader.js';
import TorrentDownloader from './torrentDownloader.js';
import FtpDownloader from './ftpDownloader.js';
import SftpDownloader from './sftpDownloader.js';
import YoutubeDownloader from './youtubeDownloader.js';

class DownloadManager {
    constructor(config, logger, progressDisplay, fileManager, notifications) {
        this.config = config;
        this.logger = logger;
        this.progressDisplay = progressDisplay;
        this.fileManager = fileManager;
        this.notifications = notifications;

        this.httpDownloader = new HttpDownloader(config, logger, progressDisplay, fileManager, notifications);
        this.torrentDownloader = new TorrentDownloader(config, logger, progressDisplay, fileManager, notifications);
        this.ftpDownloader = new FtpDownloader(config, logger, progressDisplay, fileManager, notifications);
        this.sftpDownloader = new SftpDownloader(config, logger, progressDisplay, fileManager, notifications);
        this.youtubeDownloader = new YoutubeDownloader(config, logger, progressDisplay, fileManager, notifications);

        this.activeDownloads = new Map();
        this.downloadQueue = [];
        this.isProcessing = false;
    }

    async downloadSingle(url, options = {}) {
        const downloadDir = options.downloadDir || this.config.getDownloadDirectory();
        this.fileManager.ensureDirectoryExists(downloadDir);

        try {
            if (TorrentDownloader.isValidMagnetUri(url)) {
                return await this.torrentDownloader.download(url, downloadDir, options);
            } else if (YoutubeDownloader.isValidYouTubeUrl(url)) {
                return await this.youtubeDownloader.download(url, downloadDir, options);
            } else if (FtpDownloader.isValidFtpUrl(url)) {
                const destination = this.fileManager.getDestinationPath(url, downloadDir);
                return await this.ftpDownloader.download(url, destination, options);
            } else if (SftpDownloader.isValidSftpUrl(url)) {
                const destination = this.fileManager.getDestinationPath(url, downloadDir);
                return await this.sftpDownloader.download(url, destination, options);
            } else if (HttpDownloader.isValidUrl(url)) {
                const destination = this.fileManager.getDestinationPath(url, downloadDir);
                return await this.httpDownloader.download(url, destination, options);
            } else {
                throw new Error(`Unsupported URL format: ${url}`);
            }
        } catch (error) {
            this.logger.error('Download failed', { url, error: error.message });
            throw error;
        }
    }

    async downloadMultiple(urls, options = {}) {
        const concurrent = options.concurrent !== undefined
            ? options.concurrent
            : this.config.download.maxConcurrent;

        if (concurrent === 1) {
            return await this.downloadSequentially(urls, options);
        } else {
            return await this.downloadConcurrently(urls, concurrent, options);
        }
    }

    async downloadSequentially(urls, options = {}) {
        const results = [];
        const errors = [];
        const startTime = Date.now();
        let totalSize = 0;

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            this.logger.info(`Starting download ${i + 1}/${urls.length}`, { url });

            try {
                const result = await this.downloadSingle(url, options);
                results.push({ url, result, success: true });
                totalSize += result.stats?.size || 0;
            } catch (error) {
                const errorInfo = { url, error: error.message, success: false };
                results.push(errorInfo);
                errors.push(errorInfo);

                if (options.stopOnError) {
                    break;
                }
            }
        }

        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        const successCount = results.filter(r => r.success).length;

        this.logger.info('Sequential downloads completed', {
            total: urls.length,
            successful: successCount,
            failed: errors.length,
            totalSize,
            totalTime
        });

        if (successCount > 0) {
            this.notifications.notifyAllDownloadsComplete(successCount, totalSize, totalTime);
        }

        return {
            results,
            errors,
            stats: {
                total: urls.length,
                successful: successCount,
                failed: errors.length,
                totalSize,
                totalTime
            }
        };
    }

    async downloadConcurrently(urls, maxConcurrent, options = {}) {
        const results = [];
        const errors = [];
        const startTime = Date.now();
        let totalSize = 0;

        // Create download promises with concurrency control
        const downloadPromises = urls.map(async (url, index) => {
            try {
                const result = await this.downloadSingle(url, options);
                const successResult = { url, result, success: true, index };
                results.push(successResult);
                totalSize += result.stats?.size || 0;
                return successResult;
            } catch (error) {
                const errorResult = { url, error: error.message, success: false, index };
                results.push(errorResult);
                errors.push(errorResult);
                return errorResult;
            }
        });

        // Execute downloads with concurrency limit
        const concurrentResults = await this.executeConcurrently(downloadPromises, maxConcurrent);

        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        const successCount = results.filter(r => r.success).length;

        this.logger.info('Concurrent downloads completed', {
            total: urls.length,
            successful: successCount,
            failed: errors.length,
            totalSize,
            totalTime,
            maxConcurrent
        });

        if (successCount > 0) {
            this.notifications.notifyAllDownloadsComplete(successCount, totalSize, totalTime);
        }

        return {
            results: results.sort((a, b) => a.index - b.index), // Maintain original order
            errors,
            stats: {
                total: urls.length,
                successful: successCount,
                failed: errors.length,
                totalSize,
                totalTime,
                maxConcurrent
            }
        };
    }

    async executeConcurrently(promises, maxConcurrent) {
        const results = [];
        const executing = [];

        for (const promise of promises) {
            const p = Promise.resolve(promise).then(result => {
                executing.splice(executing.indexOf(p), 1);
                return result;
            });

            results.push(p);
            executing.push(p);

            if (executing.length >= maxConcurrent) {
                await Promise.race(executing);
            }
        }

        return Promise.all(results);
    }

    async downloadFromFile(filePath, options = {}) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const urls = this.parseUrlsFromContent(content);

            if (urls.length === 0) {
                throw new Error('No valid URLs found in file');
            }

            this.logger.info(`Found ${urls.length} URLs in file`, { filePath });
            return await this.downloadMultiple(urls, options);

        } catch (error) {
            this.logger.error('Failed to process download file', { filePath, error: error.message });
            throw error;
        }
    }

    parseUrlsFromContent(content) {
        const lines = content.split('\n');
        const urls = [];

        for (let line of lines) {
            line = line.trim();

            // Skip empty lines and comments
            if (!line || line.startsWith('#') || line.startsWith('//')) {
                continue;
            }

            // Remove quotes if present
            line = line.replace(/^["']|["']$/g, '');

            // Validate URL
            if (HttpDownloader.isValidUrl(line) || TorrentDownloader.isValidMagnetUri(line)) {
                urls.push(line);
            } else {
                this.logger.warn('Invalid URL skipped', { url: line });
            }
        }

        return urls;
    }

    async pauseDownload(downloadId) {
        // Implementation for pausing downloads
        // This would require more complex state management
        this.logger.info('Pause functionality not yet implemented', { downloadId });
    }

    async resumeDownload(downloadId) {
        // Implementation for resuming downloads
        // This would require more complex state management
        this.logger.info('Resume functionality not yet implemented', { downloadId });
    }

    async cancelDownload(downloadId) {
        // Implementation for canceling downloads
        if (this.activeDownloads.has(downloadId)) {
            this.activeDownloads.delete(downloadId);
            this.logger.info('Download canceled', { downloadId });
        }
    }

    getActiveDownloads() {
        return Array.from(this.activeDownloads.keys());
    }

    cleanup() {
        this.torrentDownloader.cleanupAll();
        this.activeDownloads.clear();
        this.downloadQueue = [];
    }
}

export default DownloadManager;
