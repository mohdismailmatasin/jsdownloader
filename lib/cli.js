import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

class CLI {
    constructor(version) {
        this.program = new Command();
        this.version = version;
        this.setupCommands();
    }

    setupCommands() {
        this.program
            .name('jsdownloader')
            .description('Advanced command-line download manager with torrent support')
            .version(this.version);

        // Main download command
        this.program
            .argument('[url]', 'URL to download or path to file containing URLs')
            .option('-o, --output <dir>', 'output directory')
            .option('-c, --concurrent <number>', 'maximum concurrent downloads', '3')
            .option('--no-resume', 'disable resume capability')
            .option('--no-notifications', 'disable desktop notifications')
            .option('--sequential', 'download files sequentially instead of concurrently')
            .option('--stop-on-error', 'stop downloading when an error occurs')
            .option('--organize', 'organize downloads by file type')
            .option('--duplicate <action>', 'duplicate file handling: rename, skip, overwrite', 'rename')
            .option('-v, --verbose', 'verbose logging')
            .option('-q, --quiet', 'quiet mode (errors only)')
            .action(async (url, options) => {
                await this.handleDownload(url, options);
            });

        // Configuration commands
        const configCmd = this.program
            .command('config')
            .description('manage configuration');

        configCmd
            .command('show')
            .description('show current configuration')
            .action(() => this.showConfig());

        configCmd
            .command('init')
            .description('create user configuration file')
            .action(() => this.initConfig());

        configCmd
            .command('set <key> <value>')
            .description('set configuration value')
            .action((key, value) => this.setConfig(key, value));

        configCmd
            .command('get <key>')
            .description('get configuration value')
            .action((key) => this.getConfig(key));

        // History commands
        const historyCmd = this.program
            .command('history')
            .description('view download history');

        historyCmd
            .command('list')
            .option('-n, --number <count>', 'number of recent downloads to show', '10')
            .description('list recent downloads')
            .action((options) => this.showHistory(options));

        historyCmd
            .command('clear')
            .description('clear download history')
            .action(() => this.clearHistory());

        // Status command
        this.program
            .command('status')
            .description('show active downloads')
            .action(() => this.showStatus());

        // Cleanup command
        this.program
            .command('cleanup')
            .description('cleanup incomplete downloads and temporary files')
            .action(() => this.cleanup());
    }

    async handleDownload(url, options) {
        try {
            // Import modules dynamically to avoid circular dependencies
            const { default: ConfigManager } = await import('./config.js');
            const { default: Logger } = await import('./logger.js');
            const { default: ProgressDisplay } = await import('./progress.js');
            const { default: FileManager } = await import('./fileManager.js');
            const { default: NotificationManager } = await import('./notifications.js');
            const { default: DownloadManager } = await import('./downloadManager.js');

            // Initialize components
            const config = new ConfigManager();
            
            // Override config with CLI options
            if (options.output) {
                config.set('download', 'directory', options.output);
            }
            if (options.concurrent) {
                config.set('download', 'maxConcurrent', parseInt(options.concurrent));
            }
            if (options.resume === false) {
                config.set('download', 'enableResume', false);
            }
            if (options.notifications === false) {
                config.set('notifications', 'enabled', false);
            }
            if (options.organize) {
                config.set('download', 'organizeByType', true);
            }
            if (options.duplicate) {
                config.set('download', 'duplicateHandling', options.duplicate);
            }
            if (options.verbose) {
                config.set('logging', 'level', 'debug');
            }
            if (options.quiet) {
                config.set('logging', 'level', 'error');
            }

            const logger = new Logger(config);
            const progressDisplay = new ProgressDisplay(config);
            const fileManager = new FileManager(config);
            const notifications = new NotificationManager(config);
            const downloadManager = new DownloadManager(config, logger, progressDisplay, fileManager, notifications);

            // Handle different input types
            if (!url) {
                console.log(chalk.red('Error: No URL or file provided'));
                console.log('Use --help for usage information');
                process.exit(1);
            }

            let result;
            if (url.endsWith('.txt')) {
                // Download from file
                const downloadOptions = {
                    concurrent: options.sequential ? 1 : parseInt(options.concurrent),
                    stopOnError: options.stopOnError
                };
                result = await downloadManager.downloadFromFile(url, downloadOptions);
            } else {
                // Single download
                result = await downloadManager.downloadSingle(url);
            }

            // Display results
            this.displayResults(result);

            // Cleanup
            downloadManager.cleanup();

        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    }

    displayResults(result) {
        if (result.stats) {
            // Multiple downloads
            const { stats } = result;
            console.log(chalk.green('\n✓ Downloads completed!'));
            console.log(chalk.gray(`Total: ${stats.total}, Successful: ${stats.successful}, Failed: ${stats.failed}`));
            
            if (stats.totalSize > 0) {
                console.log(chalk.gray(`Total size: ${this.formatBytes(stats.totalSize)}`));
            }
            
            if (stats.totalTime > 0) {
                console.log(chalk.gray(`Total time: ${this.formatTime(stats.totalTime)}`));
            }

            if (result.errors && result.errors.length > 0) {
                console.log(chalk.yellow('\nErrors:'));
                result.errors.forEach(error => {
                    console.log(chalk.red(`  ✗ ${error.url}: ${error.error}`));
                });
            }
        } else {
            // Single download
            console.log(chalk.green('\n✓ Download completed!'));
        }
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

    async showConfig() {
        try {
            const { default: ConfigManager } = await import('./config.js');
            const config = new ConfigManager();
            console.log(chalk.blue('Current Configuration:'));
            console.log(JSON.stringify(config.config, null, 2));
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async initConfig() {
        try {
            const { default: ConfigManager } = await import('./config.js');
            const config = new ConfigManager();
            const userConfigPath = config.createUserConfig();
            
            if (userConfigPath) {
                console.log(chalk.green(`User configuration created at: ${userConfigPath}`));
            } else {
                console.log(chalk.yellow('User configuration already exists'));
            }
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async setConfig(key, value) {
        console.log(chalk.yellow('Configuration modification not yet implemented'));
        console.log(`Would set ${key} = ${value}`);
    }

    async getConfig(key) {
        console.log(chalk.yellow('Configuration retrieval not yet implemented'));
        console.log(`Would get ${key}`);
    }

    showHistory(options) {
        console.log(chalk.yellow('History feature not yet implemented'));
    }

    clearHistory() {
        console.log(chalk.yellow('History clear not yet implemented'));
    }

    showStatus() {
        console.log(chalk.yellow('Status feature not yet implemented'));
    }

    cleanup() {
        console.log(chalk.yellow('Cleanup feature not yet implemented'));
    }

    parse(argv) {
        this.program.parse(argv);
    }
}

export default CLI;
