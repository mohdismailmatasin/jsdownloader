import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs';

class TorrentDownloader {
    constructor(config, logger, progressDisplay, fileManager, notifications) {
        this.config = config;
        this.logger = logger;
        this.progressDisplay = progressDisplay;
        this.fileManager = fileManager;
        this.notifications = notifications;
        this.clients = new Map();
    }

    async download(magnetUri, downloadDir, options = {}) {
        const downloadId = `torrent_${Date.now()}_${Math.random()}`;
        
        return new Promise((resolve, reject) => {
            try {
                this.logger.logDownloadStart(magnetUri, downloadDir);
                
                const client = new WebTorrent({
                    maxConns: this.config.torrent.maxPeers,
                    dht: this.config.torrent.dht
                });

                this.clients.set(downloadId, client);

                client.on('error', (error) => {
                    this.logger.error('WebTorrent client error', { error: error.message });
                    this.cleanup(downloadId);
                    reject(new Error(`Torrent client error: ${error.message}`));
                });

                const torrentOptions = {
                    path: downloadDir
                };

                client.add(magnetUri, torrentOptions, (torrent) => {
                    this.handleTorrent(torrent, downloadId, downloadDir, resolve, reject);
                });

            } catch (error) {
                this.logger.logDownloadError(magnetUri, error);
                reject(error);
            }
        });
    }

    handleTorrent(torrent, downloadId, downloadDir, resolve, reject) {
        const startTime = Date.now();
        let lastProgressUpdate = Date.now();

        this.logger.info('Torrent added', {
            infoHash: torrent.infoHash,
            name: torrent.name,
            files: torrent.files.length,
            size: torrent.length
        });

        // Initialize progress for the main torrent
        this.progressDisplay.startDownload(downloadId, torrent.name, torrent.length);

        // Handle individual files if there are multiple
        if (torrent.files.length > 1) {
            this.handleMultipleFiles(torrent, downloadId);
        }

        torrent.on('download', (bytes) => {
            const now = Date.now();
            if (now - lastProgressUpdate >= this.config.progress.updateInterval) {
                const progress = (torrent.downloaded / torrent.length) * 100;
                this.progressDisplay.updateProgress(downloadId, torrent.downloaded, torrent.length);
                
                this.logger.logDownloadProgress(torrent.magnetURI, {
                    downloaded: torrent.downloaded,
                    total: torrent.length,
                    progress: progress,
                    downloadSpeed: torrent.downloadSpeed,
                    uploadSpeed: torrent.uploadSpeed,
                    peers: torrent.numPeers
                });
                
                lastProgressUpdate = now;
            }
        });

        torrent.on('done', () => {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            this.progressDisplay.completeDownload(downloadId);
            
            const stats = {
                size: torrent.length,
                duration,
                averageSpeed: torrent.length / duration,
                files: torrent.files.length,
                infoHash: torrent.infoHash
            };

            this.notifications.notifyDownloadComplete(torrent.name, stats);
            this.logger.logDownloadComplete(torrent.magnetURI, downloadDir, stats);

            // Handle seeding
            this.handleSeeding(torrent, downloadId, resolve, stats);
        });

        torrent.on('error', (error) => {
            this.progressDisplay.errorDownload(downloadId, error.message);
            this.notifications.notifyDownloadError(torrent.name, error.message);
            this.logger.logDownloadError(torrent.magnetURI, error);
            this.cleanup(downloadId);
            reject(error);
        });

        torrent.on('warning', (warning) => {
            this.logger.warn('Torrent warning', {
                infoHash: torrent.infoHash,
                warning: warning.message
            });
        });

        // Log peer information periodically
        const peerInterval = setInterval(() => {
            if (torrent.destroyed) {
                clearInterval(peerInterval);
                return;
            }

            this.logger.debug('Torrent peer info', {
                infoHash: torrent.infoHash,
                peers: torrent.numPeers,
                downloadSpeed: torrent.downloadSpeed,
                uploadSpeed: torrent.uploadSpeed,
                downloaded: torrent.downloaded,
                uploaded: torrent.uploaded,
                ratio: torrent.uploaded / torrent.downloaded || 0
            });
        }, 30000); // Log every 30 seconds
    }

    handleMultipleFiles(torrent, downloadId) {
        // Create individual progress tracking for each file
        torrent.files.forEach((file, index) => {
            const fileDownloadId = `${downloadId}_file_${index}`;
            this.progressDisplay.startDownload(fileDownloadId, file.name, file.length);
            
            // Monitor individual file progress
            const checkFileProgress = () => {
                if (torrent.destroyed) return;
                
                const downloaded = file.downloaded;
                this.progressDisplay.updateProgress(fileDownloadId, downloaded, file.length);
                
                if (downloaded >= file.length) {
                    this.progressDisplay.completeDownload(fileDownloadId);
                } else {
                    setTimeout(checkFileProgress, this.config.progress.updateInterval);
                }
            };
            
            setTimeout(checkFileProgress, this.config.progress.updateInterval);
        });
    }

    handleSeeding(torrent, downloadId, resolve, stats) {
        const seedTime = this.config.torrent.seedTime * 60 * 1000; // Convert minutes to milliseconds
        const ratioLimit = this.config.torrent.ratioLimit;

        if (seedTime === 0 && ratioLimit === 0) {
            // No seeding required
            this.cleanup(downloadId);
            resolve({ stats, files: torrent.files.map(f => f.path) });
            return;
        }

        this.logger.info('Starting seeding phase', {
            infoHash: torrent.infoHash,
            seedTime: seedTime > 0 ? `${this.config.torrent.seedTime} minutes` : 'unlimited',
            ratioLimit: ratioLimit > 0 ? ratioLimit : 'unlimited'
        });

        const seedStartTime = Date.now();
        
        const checkSeedingComplete = () => {
            if (torrent.destroyed) return;

            const currentTime = Date.now();
            const seedingDuration = currentTime - seedStartTime;
            const currentRatio = torrent.uploaded / torrent.downloaded || 0;

            let shouldStopSeeding = false;

            // Check time limit
            if (seedTime > 0 && seedingDuration >= seedTime) {
                shouldStopSeeding = true;
                this.logger.info('Seeding time limit reached', { infoHash: torrent.infoHash });
            }

            // Check ratio limit
            if (ratioLimit > 0 && currentRatio >= ratioLimit) {
                shouldStopSeeding = true;
                this.logger.info('Seeding ratio limit reached', { 
                    infoHash: torrent.infoHash, 
                    ratio: currentRatio 
                });
            }

            if (shouldStopSeeding) {
                this.cleanup(downloadId);
                resolve({ stats, files: torrent.files.map(f => f.path) });
            } else {
                setTimeout(checkSeedingComplete, 5000); // Check every 5 seconds
            }
        };

        setTimeout(checkSeedingComplete, 5000);
    }

    cleanup(downloadId) {
        const client = this.clients.get(downloadId);
        if (client) {
            try {
                client.destroy();
            } catch (error) {
                this.logger.warn('Error destroying torrent client', { error: error.message });
            }
            this.clients.delete(downloadId);
        }
    }

    cleanupAll() {
        for (const [downloadId, client] of this.clients) {
            try {
                client.destroy();
            } catch (error) {
                this.logger.warn('Error destroying torrent client during cleanup', { 
                    downloadId, 
                    error: error.message 
                });
            }
        }
        this.clients.clear();
    }

    static isValidMagnetUri(uri) {
        return typeof uri === 'string' && uri.startsWith('magnet:');
    }

    static isTorrentFile(filePath) {
        return typeof filePath === 'string' && filePath.toLowerCase().endsWith('.torrent');
    }
}

export default TorrentDownloader;
