import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

class HttpDownloader {
    constructor(config, logger, progressDisplay, fileManager, notifications) {
        this.config = config;
        this.logger = logger;
        this.progressDisplay = progressDisplay;
        this.fileManager = fileManager;
        this.notifications = notifications;
    }

    async download(url, destination, options = {}) {
        const downloadId = `http_${Date.now()}_${Math.random()}`;
        const filename = path.basename(destination);

        try {
            this.logger.logDownloadStart(url, destination);

            // Check for resume capability
            let startByte = 0;
            let resumeInfo = null;

            if (this.config.get('download', 'enableResume')) {
                resumeInfo = this.fileManager.getResumeInfo(destination);
                if (resumeInfo && fs.existsSync(destination)) {
                    const stats = fs.statSync(destination);
                    startByte = stats.size;
                    this.logger.info(`Resuming download from byte ${startByte}`, { url });
                }
            }

            const result = await this.downloadWithRetry(url, destination, downloadId, startByte, options);

            // Cleanup resume info on successful completion
            this.fileManager.cleanupResumeInfo(destination);

            this.progressDisplay.completeDownload(downloadId);
            this.notifications.notifyDownloadComplete(filename, result.stats);
            this.logger.logDownloadComplete(url, destination, result.stats);

            return result;

        } catch (error) {
            this.progressDisplay.errorDownload(downloadId, error.message);
            this.notifications.notifyDownloadError(filename, error.message);
            this.logger.logDownloadError(url, error);
            throw error;
        }
    }

    async downloadWithRetry(url, destination, downloadId, startByte = 0, options = {}) {
        let lastError;

        for (let attempt = 1; attempt <= this.config.get('download', 'maxRetries'); attempt++) {
            try {
                return await this.performDownload(url, destination, downloadId, startByte, options);
            } catch (error) {
                lastError = error;

                if (attempt < this.config.get('download', 'maxRetries')) {
                    const delay = this.config.get('download', 'retryDelay') * Math.pow(2, attempt - 1);
                    this.logger.warn(`Download attempt ${attempt} failed, retrying in ${delay}ms`, {
                        url,
                        error: error.message
                    });
                    await this.sleep(delay);
                } else {
                    this.logger.error(`All ${this.config.get('download', 'maxRetries')} download attempts failed`, {
                        url,
                        error: error.message
                    });
                }
            }
        }

        throw lastError;
    }

    performDownload(url, destination, downloadId, startByte = 0, options = {}) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let totalSize = 0;
            let downloaded = startByte;
            let redirectCount = 0;

            const performRequest = (currentUrl) => {
                const urlObj = new URL(currentUrl);
                const isHttps = urlObj.protocol === 'https:';
                const client = isHttps ? https : http;

                const requestOptions = {
                    method: 'GET',
                    headers: {
                        'User-Agent': this.config.get('protocols', 'http').userAgent,
                        ...options.headers
                    },
                    timeout: this.config.get('download', 'timeout')
                };

                // Add range header for resume
                if (startByte > 0) {
                    requestOptions.headers['Range'] = `bytes=${startByte}-`;
                }

                const req = client.request(currentUrl, requestOptions, (res) => {
                    // Handle redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        if (redirectCount >= this.config.get('protocols', 'http').maxRedirects) {
                            reject(new Error('Too many redirects'));
                            return;
                        }

                        redirectCount++;
                        const redirectUrl = new URL(res.headers.location, currentUrl).href;
                        this.logger.debug(`Redirecting to: ${redirectUrl}`);
                        performRequest(redirectUrl);
                        return;
                    }

                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                        return;
                    }

                    // Get total size
                    const contentLength = parseInt(res.headers['content-length'], 10);
                    if (contentLength) {
                        totalSize = startByte > 0 ? startByte + contentLength : contentLength;
                    }

                    // Create resume info if enabled
                    if (this.config.get('download', 'enableResume') && totalSize > 0) {
                        this.fileManager.createResumeInfo(destination, url, totalSize);
                    }

                    // Initialize progress display
                    this.progressDisplay.startDownload(downloadId, path.basename(destination), totalSize);

                    // Create write stream (append if resuming)
                    const writeStream = fs.createWriteStream(destination, {
                        flags: startByte > 0 ? 'a' : 'w'
                    });

                    let lastProgressUpdate = Date.now();

                    res.on('data', (chunk) => {
                        downloaded += chunk.length;

                        // Update progress (let progress display handle throttling)
                        this.progressDisplay.updateProgress(downloadId, downloaded, totalSize);

                        // Update resume info occasionally
                        const now = Date.now();
                        if (now - lastProgressUpdate >= 1000) { // Update resume info every second
                            if (this.config.get('download', 'enableResume')) {
                                this.fileManager.updateResumeInfo(destination, downloaded);
                            }
                            lastProgressUpdate = now;
                        }
                    });

                    res.pipe(writeStream);

                    writeStream.on('finish', () => {
                        const endTime = Date.now();
                        const duration = (endTime - startTime) / 1000;
                        const stats = {
                            size: downloaded,
                            duration,
                            averageSpeed: downloaded / duration
                        };

                        resolve({ stats, destination });
                    });

                    writeStream.on('error', (error) => {
                        reject(new Error(`Write error: ${error.message}`));
                    });
                });

                req.on('error', (error) => {
                    reject(new Error(`Request error: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.end();
            };

            performRequest(url);
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol);
        } catch {
            return false;
        }
    }
}

export default HttpDownloader;
