import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

class ConfigManager {
    constructor() {
        this.config = null;
        this.configPath = null;
        this.load();
    }

    load() {
        // Try to load user config first, then fall back to default
        const userConfigPath = path.join(os.homedir(), '.jsdownloader', 'config.yaml');
        const defaultConfigPath = path.join(process.cwd(), 'config', 'default.yaml');
        
        if (fs.existsSync(userConfigPath)) {
            this.configPath = userConfigPath;
        } else if (fs.existsSync(defaultConfigPath)) {
            this.configPath = defaultConfigPath;
        } else {
            throw new Error('No configuration file found');
        }

        try {
            const configContent = fs.readFileSync(this.configPath, 'utf8');
            this.config = YAML.parse(configContent);
            this.validateConfig();
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    validateConfig() {
        const required = [
            'download',
            'progress',
            'logging',
            'notifications',
            'protocols',
            'torrent'
        ];

        for (const section of required) {
            if (!this.config[section]) {
                throw new Error(`Missing required configuration section: ${section}`);
            }
        }

        // Validate specific settings
        if (this.config.download.maxConcurrent < 1) {
            this.config.download.maxConcurrent = 1;
        }

        if (this.config.download.maxConcurrent > 10) {
            this.config.download.maxConcurrent = 10;
        }

        if (this.config.progress.barWidth < 10) {
            this.config.progress.barWidth = 10;
        }

        if (this.config.progress.barWidth > 100) {
            this.config.progress.barWidth = 100;
        }
    }

    get(section, key = null) {
        if (key) {
            return this.config[section]?.[key];
        }
        return this.config[section];
    }

    set(section, key, value) {
        if (!this.config[section]) {
            this.config[section] = {};
        }
        this.config[section][key] = value;
    }

    save() {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            const yamlContent = YAML.stringify(this.config);
            fs.writeFileSync(this.configPath, yamlContent, 'utf8');
        } catch (error) {
            throw new Error(`Failed to save configuration: ${error.message}`);
        }
    }

    createUserConfig() {
        const userConfigDir = path.join(os.homedir(), '.jsdownloader');
        const userConfigPath = path.join(userConfigDir, 'config.yaml');
        
        if (!fs.existsSync(userConfigDir)) {
            fs.mkdirSync(userConfigDir, { recursive: true });
        }

        if (!fs.existsSync(userConfigPath)) {
            // Copy default config to user directory
            const defaultConfigPath = path.join(process.cwd(), 'config', 'default.yaml');
            if (fs.existsSync(defaultConfigPath)) {
                fs.copyFileSync(defaultConfigPath, userConfigPath);
                this.configPath = userConfigPath;
                return userConfigPath;
            }
        }
        
        return null;
    }

    getDownloadDirectory() {
        const downloadDir = this.config.download.directory;
        
        // Handle relative paths
        if (path.isAbsolute(downloadDir)) {
            return downloadDir;
        } else {
            return path.join(os.homedir(), downloadDir);
        }
    }

    getLogDirectory() {
        const logDir = this.config.logging.logDirectory;
        
        // Handle relative paths
        if (path.isAbsolute(logDir)) {
            return logDir;
        } else {
            return path.join(os.homedir(), logDir);
        }
    }
}

export default ConfigManager;
