import { promises as fs } from 'fs';
import { dirname, join } from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

export class FileLogger {
  private logFilePath: string;
  private minLogLevel: LogLevel;
  private isInitialized: boolean = false;

  constructor(
    logFilePath: string = 'mcp-server.log',
    minLogLevel: LogLevel = LogLevel.INFO
  ) {
    // If relative path, make it relative to project root
    this.logFilePath = logFilePath.startsWith('/') 
      ? logFilePath 
      : join(process.cwd(), logFilePath);
    this.minLogLevel = minLogLevel;
  }

  private async ensureLogFileExists(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure directory exists
      const logDir = dirname(this.logFilePath);
      await fs.mkdir(logDir, { recursive: true });

      // Test write access
      await fs.access(this.logFilePath, fs.constants.F_OK).catch(async () => {
        // File doesn't exist, create it
        await fs.writeFile(this.logFilePath, '');
      });

      this.isInitialized = true;
    } catch (error) {
      // Fallback to temp directory if we can't write to specified location
      const fallbackPath = join('/tmp', 'mcp-server.log');
      this.logFilePath = fallbackPath;
      await fs.writeFile(this.logFilePath, '');
      this.isInitialized = true;
    }
  }

  private formatLogEntry(level: LogLevel, message: string, data?: any): LogEntry {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    
    return {
      timestamp,
      level: levelName,
      message,
      ...(data && { data })
    };
  }

  private async writeLogEntry(logEntry: LogEntry): Promise<void> {
    await this.ensureLogFileExists();

    const logLine = logEntry.data 
      ? `[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message} | ${JSON.stringify(logEntry.data)}\n`
      : `[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}\n`;

    try {
      await fs.appendFile(this.logFilePath, logLine, 'utf8');
    } catch (error) {
      // Silently fail - we don't want logging errors to break the MCP server
      // In production, you might want to have a fallback mechanism
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLogLevel;
  }

  // Public logging methods
  async debug(message: string, data?: any): Promise<void> {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const logEntry = this.formatLogEntry(LogLevel.DEBUG, message, data);
    await this.writeLogEntry(logEntry);
  }

  async info(message: string, data?: any): Promise<void> {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const logEntry = this.formatLogEntry(LogLevel.INFO, message, data);
    await this.writeLogEntry(logEntry);
  }

  async warn(message: string, data?: any): Promise<void> {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const logEntry = this.formatLogEntry(LogLevel.WARN, message, data);
    await this.writeLogEntry(logEntry);
  }

  async error(message: string, data?: any): Promise<void> {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const logEntry = this.formatLogEntry(LogLevel.ERROR, message, data);
    await this.writeLogEntry(logEntry);
  }

  // Convenience method for logging JSON-RPC related events
  async logMCPEvent(event: string, method?: string, params?: any): Promise<void> {
    await this.info(`MCP ${event}`, {
      method,
      params: params ? JSON.stringify(params) : undefined
    });
  }

  // Method to change log level at runtime
  setLogLevel(level: LogLevel): void {
    this.minLogLevel = level;
  }

  // Method to get current log file path
  getLogFilePath(): string {
    return this.logFilePath;
  }

  // Method to clear the log file
  async clearLog(): Promise<void> {
    await this.ensureLogFileExists();
    try {
      await fs.writeFile(this.logFilePath, '');
    } catch (error) {
      // Silently fail
    }
  }

  // Static method to create a default logger instance
  static createDefault(logFileName?: string): FileLogger {
    const fileName = logFileName || `mcp-poker-${new Date().toISOString().split('T')[0]}.log`;
    return new FileLogger(fileName, LogLevel.INFO);
  }
}

// Export a default logger instance for convenience
export const logger = FileLogger.createDefault();