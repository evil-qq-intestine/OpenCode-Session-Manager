import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type Language = 'zh' | 'en';

export interface Translations {
  // CLI 命令
  cli: {
    help: string;
    list: string;
    select: string;
    resume: string;
    exportCmd: string;
    backup: string;
    exit: string;
    back: string;
  };
  // 提示信息
  prompts: {
    selectAction: string;
    selectSession: string;
    searchQuery: string;
    confirmResume: string;
    selectExportFormat: string;
    enterSessionId: string;
    noSessionsFound: string;
    noResultsFound: string;
  };
  // 操作结果
  results: {
    sessionList: string;
    foundSessions: string;
    sessionNotFound: string;
    exportSuccess: string;
    exportFailed: string;
    backupSuccess: string;
    backupFailed: string;
    launchSuccess: string;
    launchFailed: string;
    databaseConnected: string;
    databaseDisconnected: string;
    databaseError: string;
  };
  // 会话信息
  session: {
    title: string;
    id: string;
    messageCount: string;
    createdAt: string;
    updatedAt: string;
    tokensInput: string;
    tokensOutput: string;
    preview: string;
    untitled: string;
  };
  // 工具描述
  tools: {
    sessionListDesc: string;
    sessionSearchDesc: string;
    sessionSwitchDesc: string;
    sessionInfoDesc: string;
    sessionExportDesc: string;
    sessionBackupDesc: string;
    limitParam: string;
    searchParam: string;
    sessionIdParam: string;
    forkParam: string;
    outputPathParam: string;
    allParam: string;
  };
  // 错误信息
  errors: {
    databaseNotFound: string;
    databaseConnectionFailed: string;
    sessionNotExist: string;
    invalidSessionId: string;
    exportFailed: string;
    backupFailed: string;
    launchFailed: string;
    unknownCommand: string;
  };
  // 导出格式
  exportFormats: {
    json: string;
    markdown: string;
    text: string;
  };
  // 通用
  common: {
    yes: string;
    no: string;
    cancel: string;
    confirm: string;
    loading: string;
    success: string;
    error: string;
  };
}

const zhTranslations: Translations = {
  cli: {
    help: '显示帮助信息',
    list: '列出最近的会话',
    select: '交互式选择会话',
    resume: '继续指定会话',
    exportCmd: '导出会话',
    backup: '备份会话',
    exit: '退出',
    back: '返回',
  },
  prompts: {
    selectAction: '选择操作:',
    selectSession: '选择会话:',
    searchQuery: '输入搜索关键词:',
    confirmResume: '确定要继续此会话吗?',
    selectExportFormat: '选择导出格式:',
    enterSessionId: '请输入会话 ID:',
    noSessionsFound: '没有找到会话',
    noResultsFound: '没有找到匹配的结果',
  },
  results: {
    sessionList: '会话列表',
    foundSessions: '找到 {count} 个会话',
    sessionNotFound: '会话 {id} 不存在',
    exportSuccess: '会话已导出到: {path}',
    exportFailed: '导出会话失败',
    backupSuccess: '备份完成: {path}\n包含 {count} 个会话',
    backupFailed: '备份失败',
    launchSuccess: '启动 OpenCode 并继续会话: {title}',
    launchFailed: '启动 OpenCode 失败，请确保已安装 OpenCode',
    databaseConnected: '数据库连接成功',
    databaseDisconnected: '数据库断开成功',
    databaseError: '数据库错误: {error}',
  },
  session: {
    title: '标题',
    id: 'ID',
    messageCount: '消息数',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    tokensInput: '输入 Token',
    tokensOutput: '输出 Token',
    preview: '预览',
    untitled: '无标题',
  },
  tools: {
    sessionListDesc: '列出所有会话，支持搜索和分页',
    sessionSearchDesc: '搜索会话内容，支持标题和消息内容搜索',
    sessionSwitchDesc: '切换到指定会话',
    sessionInfoDesc: '获取会话详细信息',
    sessionExportDesc: '导出会话为 JSON 格式',
    sessionBackupDesc: '备份会话',
    limitParam: '返回的会话数量，默认20',
    searchParam: '搜索关键词',
    sessionIdParam: '目标会话 ID',
    forkParam: '是否创建分支，默认 false',
    outputPathParam: '输出文件路径',
    allParam: '备份所有会话',
  },
  errors: {
    databaseNotFound: '数据库未找到: {path}',
    databaseConnectionFailed: '无法连接到 OpenCode 数据库',
    sessionNotExist: '会话 {id} 不存在',
    invalidSessionId: '请提供有效的会话 ID',
    exportFailed: '导出会话失败',
    backupFailed: '备份会话失败',
    launchFailed: '启动 OpenCode 失败',
    unknownCommand: '未知命令: {command}',
  },
  exportFormats: {
    json: 'JSON (完整数据)',
    markdown: 'Markdown (可读格式)',
    text: '纯文本',
  },
  common: {
    yes: '是',
    no: '否',
    cancel: '取消',
    confirm: '确认',
    loading: '加载中...',
    success: '成功',
    error: '错误',
  },
};

const enTranslations: Translations = {
  cli: {
    help: 'Show help information',
    list: 'List recent sessions',
    select: 'Interactive session selection',
    resume: 'Resume a specific session',
    exportCmd: 'Export session',
    backup: 'Backup sessions',
    exit: 'Exit',
    back: 'Back',
  },
  prompts: {
    selectAction: 'Select action:',
    selectSession: 'Select session:',
    searchQuery: 'Enter search query:',
    confirmResume: 'Are you sure you want to resume this session?',
    selectExportFormat: 'Select export format:',
    enterSessionId: 'Enter session ID:',
    noSessionsFound: 'No sessions found',
    noResultsFound: 'No matching results found',
  },
  results: {
    sessionList: 'Session List',
    foundSessions: 'Found {count} sessions',
    sessionNotFound: 'Session {id} not found',
    exportSuccess: 'Session exported to: {path}',
    exportFailed: 'Failed to export session',
    backupSuccess: 'Backup completed: {path}\nContains {count} sessions',
    backupFailed: 'Failed to backup sessions',
    launchSuccess: 'Launching OpenCode and resuming session: {title}',
    launchFailed: 'Failed to launch OpenCode. Please ensure OpenCode is installed',
    databaseConnected: 'Database connected successfully',
    databaseDisconnected: 'Database disconnected successfully',
    databaseError: 'Database error: {error}',
  },
  session: {
    title: 'Title',
    id: 'ID',
    messageCount: 'Messages',
    createdAt: 'Created',
    updatedAt: 'Updated',
    tokensInput: 'Input Tokens',
    tokensOutput: 'Output Tokens',
    preview: 'Preview',
    untitled: 'Untitled',
  },
  tools: {
    sessionListDesc: 'List all sessions with search and pagination support',
    sessionSearchDesc: 'Search session content by title and message content',
    sessionSwitchDesc: 'Switch to a specific session',
    sessionInfoDesc: 'Get detailed session information',
    sessionExportDesc: 'Export session as JSON format',
    sessionBackupDesc: 'Backup sessions',
    limitParam: 'Number of sessions to return, default 20',
    searchParam: 'Search query',
    sessionIdParam: 'Target session ID',
    forkParam: 'Create a fork, default false',
    outputPathParam: 'Output file path',
    allParam: 'Backup all sessions',
  },
  errors: {
    databaseNotFound: 'Database not found: {path}',
    databaseConnectionFailed: 'Failed to connect to OpenCode database',
    sessionNotExist: 'Session {id} does not exist',
    invalidSessionId: 'Please provide a valid session ID',
    exportFailed: 'Failed to export session',
    backupFailed: 'Failed to backup session',
    launchFailed: 'Failed to launch OpenCode',
    unknownCommand: 'Unknown command: {command}',
  },
  exportFormats: {
    json: 'JSON (Full data)',
    markdown: 'Markdown (Readable format)',
    text: 'Plain text',
  },
  common: {
    yes: 'Yes',
    no: 'No',
    cancel: 'Cancel',
    confirm: 'Confirm',
    loading: 'Loading...',
    success: 'Success',
    error: 'Error',
  },
};

export class I18n {
  private static instance: I18n;
  private currentLanguage: Language = 'zh';
  private translations: Translations = zhTranslations;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(os.homedir(), '.config', 'opencode', 'ocsm-lang.json');
    this.loadLanguage();
  }

  static getInstance(): I18n {
    if (!I18n.instance) {
      I18n.instance = new I18n();
    }
    return I18n.instance;
  }

  private loadLanguage(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        this.setLanguage(config.language || 'zh');
      }
    } catch (error) {
      // 使用默认语言
    }
  }

  saveLanguage(lang: Language): void {
    this.currentLanguage = lang;
    this.translations = lang === 'zh' ? zhTranslations : enTranslations;
    
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify({ language: lang }, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }

  setLanguage(lang: Language): void {
    this.currentLanguage = lang;
    this.translations = lang === 'zh' ? zhTranslations : enTranslations;
  }

  getLanguage(): Language {
    return this.currentLanguage;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: any = this.translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // 返回键名作为后备
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // 替换参数 {param}
    if (params) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey] !== undefined ? String(params[paramKey]) : match;
      });
    }

    return value;
  }
}

export const i18n = I18n.getInstance();
