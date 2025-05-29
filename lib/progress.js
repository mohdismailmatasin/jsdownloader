import chalk from 'chalk';

class ProgressDisplay {
    constructor(config) {
        this.config = config;
        this.downloads = new Map();
        this.startTimes = new Map();
        this.lastUpdate = new Map();
        this.isProgressActive = false;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatSpeed(bytesPerSecond) {
        return this.formatBytes(bytesPerSecond) + '/s';
    }

    formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    calculateETA(downloaded, total, speed) {
        if (speed === 0 || total === 0) return 'Unknown';
        const remaining = total - downloaded;
        const eta = remaining / speed;
        return this.formatTime(eta);
    }

    calculateSpeed(downloadId, downloaded) {
        const now = Date.now();
        const lastUpdate = this.lastUpdate.get(downloadId) || now;
        const lastDownloaded = this.downloads.get(downloadId)?.lastDownloaded || 0;

        const timeDiff = (now - lastUpdate) / 1000; // Convert to seconds
        const bytesDiff = downloaded - lastDownloaded;

        if (timeDiff > 0) {
            const speed = bytesDiff / timeDiff;
            this.lastUpdate.set(downloadId, now);

            // Update download info
            const downloadInfo = this.downloads.get(downloadId) || {};
            downloadInfo.lastDownloaded = downloaded;
            downloadInfo.speed = speed;
            this.downloads.set(downloadId, downloadInfo);

            return speed;
        }

        return this.downloads.get(downloadId)?.speed || 0;
    }

    drawProgressBar(progress, barWidth = null) {
        const width = barWidth || this.config.get('progress', 'barWidth');
        const filledWidth = Math.floor(progress / 100 * width);
        const emptyWidth = width - filledWidth;

        let progressBar = '█'.repeat(filledWidth) + '▒'.repeat(emptyWidth);

        let color;
        if (progress >= 0 && progress <= 49) {
            color = chalk.red; // 🔴 Light Red (0-49%) - Starting/slow progress
        } else if (progress >= 50 && progress <= 99) {
            color = chalk.yellow; // 🟡 Yellow (50-99%) - Good progress
        } else {
            color = chalk.green; // 🟢 Green (100%) - Complete
        }

        return color(`[${progressBar}] ${progress.toFixed(1)}%`);
    }

    startDownload(downloadId, filename, totalSize = 0) {
        this.downloads.set(downloadId, {
            filename,
            totalSize,
            downloaded: 0,
            speed: 0,
            lastDownloaded: 0,
            startTime: Date.now()
        });
        this.startTimes.set(downloadId, Date.now());
        this.lastUpdate.set(downloadId, Date.now());
        this.isProgressActive = true;
    }

    updateProgress(downloadId, downloaded, totalSize = null) {
        const downloadInfo = this.downloads.get(downloadId);
        if (!downloadInfo) return;

        if (totalSize !== null) {
            downloadInfo.totalSize = totalSize;
        }

        downloadInfo.downloaded = downloaded;
        const speed = this.calculateSpeed(downloadId, downloaded);

        // Throttle updates to prevent too frequent terminal writes
        const now = Date.now();
        const lastDisplayUpdate = downloadInfo.lastDisplayUpdate || 0;
        if (now - lastDisplayUpdate < 1000) { // Update max every 1 second
            return;
        }
        downloadInfo.lastDisplayUpdate = now;

        const progress = downloadInfo.totalSize > 0
            ? (downloaded / downloadInfo.totalSize) * 100
            : 0;

        // Build compact single line progress display
        const shortFilename = downloadInfo.filename.length > 20
            ? downloadInfo.filename.substring(0, 17) + '...'
            : downloadInfo.filename;

        let display = `${shortFilename} `;
        display += this.drawProgressBar(progress, 20); // Shorter progress bar

        if (this.config.get('progress', 'showSpeed') && speed > 0) {
            display += ` ${this.formatSpeed(speed)}`;
        }

        // Clear the entire line and rewrite
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(display);
    }

    completeDownload(downloadId) {
        const downloadInfo = this.downloads.get(downloadId);
        if (!downloadInfo) return;

        const totalTime = (Date.now() - downloadInfo.startTime) / 1000;
        const avgSpeed = downloadInfo.downloaded / totalTime;

        // Clear the progress line and show completion
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(chalk.green(`✓ ${downloadInfo.filename} completed`));
        console.log(chalk.gray(`  Total time: ${this.formatTime(totalTime)}`));
        console.log(chalk.gray(`  Average speed: ${this.formatSpeed(avgSpeed)}`));
        console.log('');

        this.downloads.delete(downloadId);
        this.startTimes.delete(downloadId);
        this.lastUpdate.delete(downloadId);
        this.isProgressActive = false;
    }

    errorDownload(downloadId, error) {
        const downloadInfo = this.downloads.get(downloadId);
        if (!downloadInfo) return;

        // Clear the progress line and show error
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(chalk.red(`✗ ${downloadInfo.filename} failed: ${error}`));
        console.log('');

        this.downloads.delete(downloadId);
        this.startTimes.delete(downloadId);
        this.lastUpdate.delete(downloadId);
        this.isProgressActive = false;
    }

    displayMultipleDownloads() {
        if (this.downloads.size === 0) return;

        console.clear();
        console.log(chalk.bold('Active Downloads:\n'));

        for (const [downloadId, info] of this.downloads) {
            const progress = info.totalSize > 0
                ? (info.downloaded / info.totalSize) * 100
                : 0;

            let display = `${chalk.cyan(info.filename)}\n`;
            display += this.drawProgressBar(progress);

            if (this.config.get('progress', 'showFileSize') && info.totalSize > 0) {
                display += ` ${this.formatBytes(info.downloaded)}/${this.formatBytes(info.totalSize)}`;
            }

            if (this.config.get('progress', 'showSpeed') && info.speed > 0) {
                display += ` ${chalk.blue(this.formatSpeed(info.speed))}`;
            }

            if (this.config.get('progress', 'showETA') && info.totalSize > 0 && info.speed > 0) {
                const eta = this.calculateETA(info.downloaded, info.totalSize, info.speed);
                display += ` ETA: ${chalk.magenta(eta)}`;
            }

            console.log(display);
            console.log('');
        }
    }
}

export default ProgressDisplay;
