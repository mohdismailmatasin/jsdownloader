import notifier from 'node-notifier';
import path from 'path';

class NotificationManager {
    constructor(config) {
        this.config = config;
        this.enabled = config.get('notifications', 'enabled');
    }

    send(title, message, type = 'info') {
        if (!this.enabled) return;

        const options = {
            title,
            message,
            sound: true,
            wait: false
        };

        // Set icon based on type
        switch (type) {
            case 'success':
                options.icon = this.getIcon('success');
                break;
            case 'error':
                options.icon = this.getIcon('error');
                break;
            case 'warning':
                options.icon = this.getIcon('warning');
                break;
            default:
                options.icon = this.getIcon('info');
        }

        try {
            notifier.notify(options);
        } catch (error) {
            // Silently fail if notifications are not supported
            console.warn('Notifications not supported on this system');
        }
    }

    getIcon(type) {
        // Return appropriate icon path based on platform and type
        // For now, we'll use default system icons
        return null;
    }

    notifyDownloadComplete(filename, stats = {}) {
        if (!this.config.get('notifications', 'onComplete')) return;

        const message = stats.size
            ? `Downloaded ${this.formatBytes(stats.size)} in ${this.formatTime(stats.duration)}`
            : 'Download completed successfully';

        this.send(
            'Download Complete',
            `${filename}\n${message}`,
            'success'
        );
    }

    notifyDownloadError(filename, error) {
        if (!this.config.get('notifications', 'onError')) return;

        this.send(
            'Download Failed',
            `${filename}\nError: ${error}`,
            'error'
        );
    }

    notifyAllDownloadsComplete(count, totalSize = 0, totalTime = 0) {
        if (!this.config.get('notifications', 'onComplete')) return;

        let message = `${count} download${count > 1 ? 's' : ''} completed`;

        if (totalSize > 0) {
            message += `\nTotal size: ${this.formatBytes(totalSize)}`;
        }

        if (totalTime > 0) {
            message += `\nTotal time: ${this.formatTime(totalTime)}`;
        }

        this.send(
            'All Downloads Complete',
            message,
            'success'
        );
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

export default NotificationManager;
