import FTP from 'ftp';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

class FtpDownloader {
    constructor(config, logger, progressDisplay, fileManager, notifications) {
        this.config = config;
        this.logger = logger;
        this.progressDisplay = progressDisplay;
        this.fileManager = fileManager;
        this.notifications = notifications;
    }

    async download(url, destination, options = {}) {
        const downloadId = `ftp_${Date.now()}_${Math.random()}`;
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
                    this.logger.warn(`FTP download attempt ${attempt} failed, retrying in ${delay}ms`, {
                        url,
                        error: error.message
                    });
                    await this.sleep(delay);
                } else {
                    this.logger.error(`All ${this.config.download.maxRetries} FTP download attempts failed`, {
                        url,
                        error: error.message
                    });
                }
            }
        }
        
        throw lastError;
    }

    performDownload(url, destination, downloadId, options = {}) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const urlObj = new URL(url);
            
            const client = new FTP();
            
            const connectionOptions = {
                host: urlObj.hostname,
                port: urlObj.port || this.config.protocols.ftp.port,
                user: urlObj.username || 'anonymous',
                password: urlObj.password || 'anonymous@',
                connTimeout: this.config.protocols.ftp.timeout,
                pasvTimeout: this.config.protocols.ftp.timeout,
                keepalive: 10000
            };

            client.on('ready', () => {
                this.logger.debug('FTP connection established', { host: urlObj.hostname });
                
                const remotePath = decodeURIComponent(urlObj.pathname);
                
                // Get file size first
                client.size(remotePath, (err, size) => {
                    if (err) {
                        this.logger.warn('Could not get file size', { error: err.message });
                        size = 0;
                    }

                    // Initialize progress display
                    this.progressDisplay.startDownload(downloadId, path.basename(destination), size);

                    // Start download
                    client.get(remotePath, (err, stream) => {
                        if (err) {
                            client.end();
                            reject(new Error(`FTP get error: ${err.message}`));
                            return;
                        }

                        const writeStream = fs.createWriteStream(destination);
                        let downloaded = 0;
                        let lastProgressUpdate = Date.now();

                        stream.on('data', (chunk) => {
                            downloaded += chunk.length;
                            
                            // Update progress at configured intervals
                            const now = Date.now();
                            if (now - lastProgressUpdate >= this.config.progress.updateInterval) {
                                this.progressDisplay.updateProgress(downloadId, downloaded, size);
                                lastProgressUpdate = now;
                            }
                        });

                        stream.on('close', () => {
                            client.end();
                            
                            const endTime = Date.now();
                            const duration = (endTime - startTime) / 1000;
                            const stats = {
                                size: downloaded,
                                duration,
                                averageSpeed: downloaded / duration
                            };
                            
                            resolve({ stats, destination });
                        });

                        stream.on('error', (error) => {
                            client.end();
                            reject(new Error(`FTP stream error: ${error.message}`));
                        });

                        writeStream.on('error', (error) => {
                            client.end();
                            reject(new Error(`Write error: ${error.message}`));
                        });

                        stream.pipe(writeStream);
                    });
                });
            });

            client.on('error', (error) => {
                reject(new Error(`FTP connection error: ${error.message}`));
            });

            client.connect(connectionOptions);
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static isValidFtpUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'ftp:';
        } catch {
            return false;
        }
    }
}

export default FtpDownloader;
