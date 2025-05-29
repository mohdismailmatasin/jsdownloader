import ytdl from 'ytdl-core';
import fs from 'fs';
import path from 'path';

class YoutubeDownloader {
    constructor(config, logger, progressDisplay, fileManager, notifications) {
        this.config = config;
        this.logger = logger;
        this.progressDisplay = progressDisplay;
        this.fileManager = fileManager;
        this.notifications = notifications;
    }

    async download(url, destination, options = {}) {
        const downloadId = `youtube_${Date.now()}_${Math.random()}`;
        
        try {
            this.logger.logDownloadStart(url, destination);
            
            const result = await this.downloadWithRetry(url, destination, downloadId, options);
            
            this.progressDisplay.completeDownload(downloadId);
            this.notifications.notifyDownloadComplete(path.basename(destination), result.stats);
            this.logger.logDownloadComplete(url, destination, result.stats);
            
            return result;
            
        } catch (error) {
            this.progressDisplay.errorDownload(downloadId, error.message);
            this.notifications.notifyDownloadError(path.basename(destination), error.message);
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
                    this.logger.warn(`YouTube download attempt ${attempt} failed, retrying in ${delay}ms`, {
                        url,
                        error: error.message
                    });
                    await this.sleep(delay);
                } else {
                    this.logger.error(`All ${this.config.download.maxRetries} YouTube download attempts failed`, {
                        url,
                        error: error.message
                    });
                }
            }
        }
        
        throw lastError;
    }

    async performDownload(url, destination, downloadId, options = {}) {
        return new Promise(async (resolve, reject) => {
            const startTime = Date.now();
            
            try {
                // Get video info
                const info = await ytdl.getInfo(url);
                const title = info.videoDetails.title;
                const lengthSeconds = parseInt(info.videoDetails.lengthSeconds);
                
                // Sanitize title for filename if destination is a directory
                let finalDestination = destination;
                if (fs.existsSync(destination) && fs.statSync(destination).isDirectory()) {
                    const sanitizedTitle = this.sanitizeFilename(title);
                    const extension = options.format === 'audio' ? '.mp3' : '.mp4';
                    finalDestination = path.join(destination, sanitizedTitle + extension);
                }

                // Handle duplicate files
                finalDestination = this.fileManager.handleDuplicateFile(finalDestination);

                this.logger.info('Starting YouTube download', {
                    title,
                    duration: lengthSeconds,
                    destination: finalDestination
                });

                // Set up download options
                const downloadOptions = {
                    quality: options.quality || 'highest',
                    filter: options.format === 'audio' ? 'audioonly' : 'videoandaudio'
                };

                // Create download stream
                const stream = ytdl(url, downloadOptions);
                const writeStream = fs.createWriteStream(finalDestination);

                let downloaded = 0;
                let totalSize = 0;
                let lastProgressUpdate = Date.now();

                // Initialize progress display
                this.progressDisplay.startDownload(downloadId, path.basename(finalDestination), 0);

                stream.on('response', (response) => {
                    totalSize = parseInt(response.headers['content-length']) || 0;
                    if (totalSize > 0) {
                        this.progressDisplay.startDownload(downloadId, path.basename(finalDestination), totalSize);
                    }
                });

                stream.on('data', (chunk) => {
                    downloaded += chunk.length;
                    
                    // Update progress at configured intervals
                    const now = Date.now();
                    if (now - lastProgressUpdate >= this.config.progress.updateInterval) {
                        this.progressDisplay.updateProgress(downloadId, downloaded, totalSize);
                        lastProgressUpdate = now;
                    }
                });

                stream.on('progress', (chunkLength, downloaded, total) => {
                    const now = Date.now();
                    if (now - lastProgressUpdate >= this.config.progress.updateInterval) {
                        this.progressDisplay.updateProgress(downloadId, downloaded, total);
                        lastProgressUpdate = now;
                    }
                });

                stream.on('error', (error) => {
                    writeStream.destroy();
                    reject(new Error(`YouTube stream error: ${error.message}`));
                });

                writeStream.on('error', (error) => {
                    reject(new Error(`Write error: ${error.message}`));
                });

                writeStream.on('finish', () => {
                    const endTime = Date.now();
                    const duration = (endTime - startTime) / 1000;
                    const finalSize = fs.statSync(finalDestination).size;
                    
                    const stats = {
                        size: finalSize,
                        duration,
                        averageSpeed: finalSize / duration,
                        title,
                        videoLength: lengthSeconds
                    };
                    
                    resolve({ stats, destination: finalDestination });
                });

                stream.pipe(writeStream);

            } catch (error) {
                reject(new Error(`YouTube info error: ${error.message}`));
            }
        });
    }

    sanitizeFilename(filename) {
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 200); // Limit length
    }

    async getVideoInfo(url) {
        try {
            const info = await ytdl.getInfo(url);
            return {
                title: info.videoDetails.title,
                description: info.videoDetails.description,
                duration: parseInt(info.videoDetails.lengthSeconds),
                author: info.videoDetails.author.name,
                viewCount: parseInt(info.videoDetails.viewCount),
                uploadDate: info.videoDetails.uploadDate,
                formats: info.formats.map(format => ({
                    itag: format.itag,
                    quality: format.quality,
                    container: format.container,
                    hasVideo: format.hasVideo,
                    hasAudio: format.hasAudio,
                    filesize: format.contentLength
                }))
            };
        } catch (error) {
            throw new Error(`Failed to get video info: ${error.message}`);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static isValidYouTubeUrl(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            return hostname.includes('youtube.com') || 
                   hostname.includes('youtu.be') || 
                   hostname.includes('m.youtube.com');
        } catch {
            return false;
        }
    }

    static extractVideoId(url) {
        try {
            const urlObj = new URL(url);
            
            if (urlObj.hostname.includes('youtu.be')) {
                return urlObj.pathname.slice(1);
            } else if (urlObj.hostname.includes('youtube.com')) {
                return urlObj.searchParams.get('v');
            }
            
            return null;
        } catch {
            return null;
        }
    }
}

export default YoutubeDownloader;
