import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

const WebTorrent = (await import('webtorrent')).default;

const waitTime = 3000;

const drawProgressBar = (progress) => {
    const barWidth = 30;
    const filledWidth = Math.floor(progress / 100 * barWidth);
    const emptyWidth = barWidth - filledWidth;
    let progressBar = '█'.repeat(filledWidth) + '▒'.repeat(emptyWidth);

    let color;
    if (progress >= 1 && progress <= 49) {
        color = '\x1b[31m';
    } else if (progress >= 50 && progress <= 99) {
        color = '\x1b[33m';
    } else {
        color = '\x1b[32m';
    }

    return `${color}[${progressBar}] ${progress}%\x1b[0m`;
};

const getDownloadDirectory = () => {
    let downloadsDir;

    switch (os.platform()) {
        case 'win32':
            downloadsDir = path.join(os.homedir(), 'Desktop', 'downloads');
            break;
        case 'darwin':
            downloadsDir = path.join(os.homedir(), 'Desktop', 'downloads');
            break;
        case 'linux':
            downloadsDir = path.join(os.homedir(), 'Desktop', 'downloads');
            break;
        default:
            throw new Error('Unsupported platform');
    }

    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    return downloadsDir;
};

const downloadFile = (url, destination) => {
    return new Promise((resolve, reject) => {
        const downloadDir = getDownloadDirectory();

        https.get(url, (res) => {
            const totalSize = parseInt(res.headers['content-length'], 10);
            let downloaded = 0;

            const writeStream = fs.createWriteStream(destination);
            res.on('data', (chunk) => {
                downloaded += chunk.length;
                const progress = Math.floor((downloaded / totalSize) * 100);
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                process.stdout.write(`Progress: ${drawProgressBar(progress)}`);
            });

            res.pipe(writeStream);

            writeStream.on('finish', () => {
                console.log(`\nDownload finished: ${destination}`);
                resolve();
            });

            writeStream.on('error', (err) => {
                console.error(`Error downloading ${url}: ${err.message}`);
                reject(err);
            });
        }).on('error', (err) => {
            console.error(`Error downloading ${url}: ${err.message}`);
            reject(err);
        });
    });
};

const downloadTorrent = (torrentLink) => {
    return new Promise((resolve, reject) => {
        const client = new WebTorrent();
        client.on('error', (err) => {
            console.error('Error with torrent client: ', err);
            reject(err);
        });

        const downloadDir = getDownloadDirectory();

        client.add(torrentLink, { path: downloadDir }, (torrent) => {
            torrent.on('download', (bytes) => {
                const progress = Math.floor((torrent.downloaded / torrent.length) * 100);
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                process.stdout.write(`Progress: ${drawProgressBar(progress)}`);
            });

            torrent.on('done', () => {
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                process.stdout.write(`Progress: ${drawProgressBar(100)}\n`);
                console.log(`Download finished: ${torrent.infoHash}`);
                client.destroy();
                resolve();
            });
        });
    });
};

const downloadFromTxtFile = (filePath) => {
    fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
            console.error(`Error reading ${filePath}: ${err.message}`);
            return;
        }

        const urls = data.split('\n').map(url => url.trim().replace(/^["']|["']$/g, '')).filter(url => url !== '');

        const downloadSequentially = async () => {
            for (const url of urls) {
                try {
                    if (url.startsWith('magnet:')) {
                        await downloadTorrent(url);
                    } else {
                        const fileName = path.basename(url);
                        await downloadFile(url, path.join(getDownloadDirectory(), fileName));
                    }
                } catch (err) {
                    console.error(`Error during download: ${err.message}`);
                    break;
                }
            }
            console.log('All downloads finished.');
            process.exit(0);
        };

        downloadSequentially().catch((err) => {
            console.error('Error in sequential download process:', err);
            process.exit(1);
        });
    });
};

const downloadFromLink = (urlOrPath) => {
    const downloadDir = getDownloadDirectory();

    if (urlOrPath.endsWith('.txt')) {
        downloadFromTxtFile(urlOrPath);
    } else if (urlOrPath.startsWith('magnet:')) {
        downloadTorrent(urlOrPath)
            .then(() => {
                process.exit(0);
            })
            .catch((err) => {
                console.error('Magnet link download error:', err);
                process.exit(1);
            });
    } else {
        const fileName = path.basename(urlOrPath);
        downloadFile(urlOrPath, path.join(downloadDir, fileName));
    }
};

let downloadLink = process.argv[2];

if (downloadLink && downloadLink.startsWith("'") && downloadLink.endsWith("'")) {
    downloadLink = downloadLink.slice(1, -1);
} else if (downloadLink && downloadLink.startsWith('"') && downloadLink.endsWith('"')) {
    downloadLink = downloadLink.slice(1, -1);
}

if (downloadLink) {
    downloadFromLink(downloadLink);
} else {
    console.error('Please provide a URL or a path to a .txt file with URLs.');
}

