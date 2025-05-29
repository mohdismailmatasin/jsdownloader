import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mime from 'mime-types';

class FileManager {
    constructor(config) {
        this.config = config;
    }

    ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    getFileTypeDirectory(filename) {
        if (!this.config.get('download', 'organizeByType')) {
            return '';
        }

        const ext = path.extname(filename).toLowerCase();
        const mimeType = mime.lookup(ext);

        if (!mimeType) return 'other';

        const [type] = mimeType.split('/');

        switch (type) {
            case 'image':
                return 'images';
            case 'video':
                return 'videos';
            case 'audio':
                return 'audio';
            case 'text':
                return 'documents';
            case 'application':
                if (ext === '.pdf') return 'documents';
                if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archives';
                return 'applications';
            default:
                return 'other';
        }
    }

    handleDuplicateFile(filePath) {
        if (!fs.existsSync(filePath)) {
            return filePath;
        }

        const handling = this.config.get('download', 'duplicateHandling');

        switch (handling) {
            case 'skip':
                throw new Error(`File already exists: ${filePath}`);

            case 'overwrite':
                return filePath;

            case 'rename':
            default:
                return this.generateUniqueFilename(filePath);
        }
    }

    generateUniqueFilename(filePath) {
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const basename = path.basename(filePath, ext);

        let counter = 1;
        let newPath = filePath;

        while (fs.existsSync(newPath)) {
            const newBasename = `${basename} (${counter})`;
            newPath = path.join(dir, newBasename + ext);
            counter++;
        }

        return newPath;
    }

    getDestinationPath(url, baseDir) {
        const filename = this.extractFilename(url);
        const typeDir = this.getFileTypeDirectory(filename);
        const fullDir = typeDir ? path.join(baseDir, typeDir) : baseDir;

        this.ensureDirectoryExists(fullDir);

        const filePath = path.join(fullDir, filename);
        return this.handleDuplicateFile(filePath);
    }

    extractFilename(url) {
        try {
            const urlObj = new URL(url);
            let filename = path.basename(urlObj.pathname);

            // If no filename in URL, generate one
            if (!filename || filename === '/') {
                const timestamp = Date.now();
                filename = `download_${timestamp}`;
            }

            // Remove query parameters from filename
            filename = filename.split('?')[0];

            // Sanitize filename
            filename = this.sanitizeFilename(filename);

            return filename;
        } catch (error) {
            // If URL parsing fails, generate a filename
            const timestamp = Date.now();
            return `download_${timestamp}`;
        }
    }

    sanitizeFilename(filename) {
        // Remove or replace invalid characters
        const sanitized = filename
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '');

        // Ensure filename is not empty
        return sanitized || 'download';
    }

    calculateChecksum(filePath, algorithm = 'sha256') {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash(algorithm);
            const stream = fs.createReadStream(filePath);

            stream.on('data', (data) => {
                hash.update(data);
            });

            stream.on('end', () => {
                resolve(hash.digest('hex'));
            });

            stream.on('error', (error) => {
                reject(error);
            });
        });
    }

    async verifyFile(filePath, expectedChecksum, algorithm = 'sha256') {
        if (!this.config.get('verification', 'enabled') || !expectedChecksum) {
            return true;
        }

        try {
            const actualChecksum = await this.calculateChecksum(filePath, algorithm);
            return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
        } catch (error) {
            throw new Error(`Checksum verification failed: ${error.message}`);
        }
    }

    getFileStats(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                exists: true
            };
        } catch (error) {
            return {
                size: 0,
                created: null,
                modified: null,
                exists: false
            };
        }
    }

    createResumeInfo(filePath, url, totalSize) {
        const resumeInfoPath = filePath + '.resume';
        const resumeInfo = {
            url,
            totalSize,
            downloadedSize: 0,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        try {
            fs.writeFileSync(resumeInfoPath, JSON.stringify(resumeInfo, null, 2));
            return resumeInfoPath;
        } catch (error) {
            throw new Error(`Failed to create resume info: ${error.message}`);
        }
    }

    getResumeInfo(filePath) {
        const resumeInfoPath = filePath + '.resume';

        try {
            if (fs.existsSync(resumeInfoPath)) {
                const resumeData = fs.readFileSync(resumeInfoPath, 'utf8');
                return JSON.parse(resumeData);
            }
        } catch (error) {
            // If resume file is corrupted, ignore it
        }

        return null;
    }

    updateResumeInfo(filePath, downloadedSize) {
        const resumeInfoPath = filePath + '.resume';

        try {
            if (fs.existsSync(resumeInfoPath)) {
                const resumeData = JSON.parse(fs.readFileSync(resumeInfoPath, 'utf8'));
                resumeData.downloadedSize = downloadedSize;
                resumeData.lastModified = new Date().toISOString();
                fs.writeFileSync(resumeInfoPath, JSON.stringify(resumeData, null, 2));
            }
        } catch (error) {
            // Silently fail if we can't update resume info
        }
    }

    cleanupResumeInfo(filePath) {
        const resumeInfoPath = filePath + '.resume';

        try {
            if (fs.existsSync(resumeInfoPath)) {
                fs.unlinkSync(resumeInfoPath);
            }
        } catch (error) {
            // Silently fail if we can't cleanup resume info
        }
    }
}

export default FileManager;
