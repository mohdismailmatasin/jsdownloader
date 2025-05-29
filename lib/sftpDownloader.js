import SftpClient from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

class SftpDownloader {
    constructor(config, logger, progressDisplay, fileManager, notifications) {
        this.config = config;
        this.logger = logger;
        this.progressDisplay = progressDisplay;
        this.fileManager = fileManager;
        this.notifications = notifications;
    }

    async download(url, destination, options = {}) {
        const downloadId = `sftp_${Date.now()}_${Math.random()}`;
        const filename = path.basename(destination);
        
        try {
            this.logger.logDownloadStart(url, destination);
            
            const result = await this.downloadWithRetry(url, destination, downloadId, options);
            
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

    async downloadWithRetry(url, destination, downloadId, options = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.config.download.maxRetries; attempt++) {
            try {
                return await this.performDownload(url, destination, downloadId, options);
            } catch (error) {
                lastError = error;
                
                if (attempt < this.config.download.maxRetries) {
                    const delay = this.config.download.retryDelay * Math.pow(2, attempt - 1);
                    this.logger.warn(`SFTP download attempt ${attempt} failed, retrying in ${delay}ms`, {
                        url,
                        error: error.message
                    });
                    await this.sleep(delay);
                } else {
                    this.logger.error(`All ${this.config.download.maxRetries} SFTP download attempts failed`, {
                        url,
                        error: error.message
                    });
                }
            }
        }
        
        throw lastError;
    }

    async performDownload(url, destination, downloadId, options = {}) {
        const startTime = Date.now();
        const urlObj = new URL(url);
        const sftp = new SftpClient();
        
        try {
            const connectionOptions = {
                host: urlObj.hostname,
                port: urlObj.port || this.config.protocols.sftp.port,
                username: urlObj.username || 'anonymous',
                password: urlObj.password,
                connectTimeout: this.config.protocols.sftp.timeout,
                ...options.sftpOptions
            };

            // Handle SSH key authentication if provided
            if (options.privateKey) {
                connectionOptions.privateKey = options.privateKey;
                delete connectionOptions.password;
            }

            this.logger.debug('Connecting to SFTP server', { host: urlObj.hostname });
            await sftp.connect(connectionOptions);

            const remotePath = decodeURIComponent(urlObj.pathname);
            
            // Get file stats
            let fileSize = 0;
            try {
                const stats = await sftp.stat(remotePath);
                fileSize = stats.size;
            } catch (error) {
                this.logger.warn('Could not get file size', { error: error.message });
            }

            // Initialize progress display
            this.progressDisplay.startDownload(downloadId, path.basename(destination), fileSize);

            // Download with progress tracking
            let downloaded = 0;
            let lastProgressUpdate = Date.now();

            const downloadOptions = {
                step: (totalTransferred, chunk, total) => {
                    downloaded = totalTransferred;
                    
                    // Update progress at configured intervals
                    const now = Date.now();
                    if (now - lastProgressUpdate >= this.config.progress.updateInterval) {
                        this.progressDisplay.updateProgress(downloadId, downloaded, total);
                        lastProgressUpdate = now;
                    }
                }
            };

            await sftp.fastGet(remotePath, destination, downloadOptions);
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            const stats = {
                size: downloaded || fileSize,
                duration,
                averageSpeed: (downloaded || fileSize) / duration
            };

            return { stats, destination };

        } catch (error) {
            throw new Error(`SFTP error: ${error.message}`);
        } finally {
            try {
                await sftp.end();
            } catch (error) {
                this.logger.warn('Error closing SFTP connection', { error: error.message });
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static isValidSftpUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'sftp:';
        } catch {
            return false;
        }
    }
}

export default SftpDownloader;
