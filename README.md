# JS Downloader 2.0

A powerful, feature-rich command-line download manager built with Node.js that supports multiple protocols, concurrent downloads, resume capability, and intelligent progress tracking.

## ✨ Features

### 🚀 Core Download Capabilities

- **HTTP/HTTPS Downloads** - Direct web links with resume support
- **Torrent Downloads** - Full WebTorrent support for magnet links
- **FTP/SFTP Downloads** - Secure file transfer protocols
- **YouTube Downloads** - Video and audio downloads from YouTube
- **Batch Downloads** - Process multiple URLs from text files

### 🔧 Advanced Features

- **Resume Downloads** - Automatically resume interrupted downloads
- **Concurrent Downloads** - Download multiple files simultaneously (configurable)
- **Smart Progress Bar** - Single-line progress with speed, percentage, and ETA
- **File Organization** - Auto-organize downloads by file type
- **Desktop Notifications** - Get notified when downloads complete
- **Comprehensive Logging** - Detailed logs with rotation
- **Configuration System** - Customizable YAML-based settings
- **Error Handling** - Automatic retry with exponential backoff

### 🎨 Progress Display

- 🔴 **Red (0-49%)** - Starting/slow progress
- 🟡 **Yellow (50-99%)** - Good progress
- 🟢 **Green (100%)** - Complete

## 📋 Requirements

- **Node.js** 16.0.0 or higher
- **npm** (Node Package Manager)

## 🔧 Installation

1. **Clone or download the project**

   ```bash
   git clone <repository-url>
   cd jsdownloader
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Initialize configuration (optional)**

   ```bash
   node jsdownloader.js config init
   ```

## 🚀 Usage

### Basic Usage

```bash
# Download a single file
node jsdownloader.js https://example.com/file.zip

# Download with custom options
node jsdownloader.js https://example.com/file.zip --output ~/Downloads --concurrent 5

# Download from a file list
node jsdownloader.js downloads.txt --sequential
```

### Command Options

```bash
node jsdownloader.js [URL] [OPTIONS]

Options:
  -o, --output <dir>           Output directory
  -c, --concurrent <number>    Maximum concurrent downloads (default: 3)
  --no-resume                  Disable resume capability
  --no-notifications           Disable desktop notifications
  --sequential                 Download files sequentially
  --stop-on-error             Stop on first error
  --organize                  Organize downloads by file type
  --duplicate <action>        Handle duplicates: rename, skip, overwrite
  -v, --verbose               Verbose logging
  -q, --quiet                 Quiet mode (errors only)
  --help                      Show help
  --version                   Show version
```

### Supported Protocols

#### HTTP/HTTPS Downloads

```bash
node jsdownloader.js https://example.com/file.zip
node jsdownloader.js http://example.com/document.pdf
```

#### Torrent Downloads

```bash
node jsdownloader.js "magnet:?xt=urn:btih:..."
```

#### FTP Downloads

```bash
node jsdownloader.js ftp://username:password@ftp.example.com/file.zip
```

#### SFTP Downloads

```bash
node jsdownloader.js sftp://username:password@sftp.example.com/file.zip
```

#### YouTube Downloads

```bash
node jsdownloader.js https://www.youtube.com/watch?v=VIDEO_ID
node jsdownloader.js https://youtu.be/VIDEO_ID
```

### Batch Downloads

Create a text file with URLs (one per line):

**downloads.txt**

```bash
https://example.com/file1.zip
https://example.com/file2.pdf
"magnet:?xt=urn:btih:..."
ftp://ftp.example.com/file3.tar.gz
https://www.youtube.com/watch?v=VIDEO_ID
```

Then run:

```bash
node jsdownloader.js downloads.txt
```

## ⚙️ Configuration

### Configuration Management

```bash
# Show current configuration
node jsdownloader.js config show

# Initialize user configuration
node jsdownloader.js config init
```

### Configuration File

User configuration is stored at:

- **Windows**: `%USERPROFILE%\.jsdownloader\config.yaml`
- **macOS/Linux**: `~/.jsdownloader/config.yaml`

### Key Configuration Options

```yaml
download:
  directory: "Desktop/downloads"    # Download directory
  maxConcurrent: 3                  # Max concurrent downloads
  enableResume: true                # Enable resume capability
  organizeByType: false             # Organize by file type
  duplicateHandling: "rename"       # rename, skip, overwrite

progress:
  showSpeed: true                   # Show download speed
  showETA: true                     # Show estimated time
  showFileSize: true                # Show file sizes
  barWidth: 20                      # Progress bar width

logging:
  level: "info"                     # error, warn, info, debug
  enableFileLogging: true           # Enable log files

notifications:
  enabled: true                     # Desktop notifications
  onComplete: true                  # Notify on completion
  onError: true                     # Notify on errors
```

## 📁 Project Structure

```bash
jsdownloader/
├── jsdownloader.js              # Main entry point
├── package.json                 # Project dependencies
├── config/
│   └── default.yaml            # Default configuration
└── lib/
    ├── cli.js                  # Command-line interface
    ├── config.js               # Configuration manager
    ├── downloadManager.js      # Download orchestration
    ├── progress.js             # Progress display
    ├── logger.js               # Logging system
    ├── notifications.js        # Desktop notifications
    ├── fileManager.js          # File management
    ├── httpDownloader.js       # HTTP/HTTPS downloads
    ├── torrentDownloader.js    # Torrent downloads
    ├── ftpDownloader.js        # FTP downloads
    ├── sftpDownloader.js       # SFTP downloads
    └── youtubeDownloader.js    # YouTube downloads
```

## 🔄 Resume Downloads

Downloads can be automatically resumed if interrupted:

```bash
# Resume is enabled by default
node jsdownloader.js https://example.com/largefile.zip

# Disable resume for a download
node jsdownloader.js --no-resume https://example.com/file.zip
```

Resume information is stored in `.resume` files alongside downloads.

## 📊 File Organization

### Organize by File Type

```bash
# Enable file type organization
node jsdownloader.js --organize https://example.com/file.zip
```

Files are organized into:

- **images/** - Image files (jpg, png, gif, etc.)
- **videos/** - Video files (mp4, avi, mkv, etc.)
- **audio/** - Audio files (mp3, wav, flac, etc.)
- **documents/** - Documents (pdf, doc, txt, etc.)
- **archives/** - Archives (zip, rar, 7z, etc.)
- **applications/** - Applications and executables
- **other/** - Other file types

### Duplicate Handling

- **rename** - Add (1), (2), etc. to filename
- **skip** - Skip download if file exists
- **overwrite** - Replace existing file

## 🚨 Error Handling

- **Automatic Retry** - Failed downloads are retried with exponential backoff
- **Detailed Logging** - Comprehensive error logging and debugging
- **Graceful Degradation** - Continue with other downloads if one fails
- **Network Resilience** - Handle timeouts and connection issues

## 📝 Examples

```bash
# Basic download
node jsdownloader.js https://releases.ubuntu.com/22.04/ubuntu-22.04.3-desktop-amd64.iso

# Concurrent downloads with organization
node jsdownloader.js downloads.txt --concurrent 5 --organize

# Quiet mode with custom output
node jsdownloader.js https://example.com/file.zip --quiet --output ~/Downloads

# Sequential downloads with error stopping
node jsdownloader.js downloads.txt --sequential --stop-on-error
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **WebTorrent** - Torrent downloading capability
- **Commander.js** - Command-line interface
- **Winston** - Logging framework
- **Chalk** - Terminal styling
- **Node.js** - Runtime environment
