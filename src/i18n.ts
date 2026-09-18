import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Language = 'zh' | 'en';

export interface Translations {
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
  exportFormats: {
    json: string;
    markdown: string;
    text: string;
  };
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

const localesDir = path.join(__dirname, '..', 'locales');

function loadTranslations(lang: Language): Translations {
  const filePath = path.join(localesDir, `${lang}.json`);
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    console.error(`Failed to load translations for ${lang}, falling back to zh`);
    const fallbackPath = path.join(localesDir, 'zh.json');
    return JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
  }
}

export function getAvailableLanguages(): Language[] {
  try {
    return fs.readdirSync(localesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', '') as Language);
  } catch {
    return ['zh', 'en'];
  }
}

export class I18n {
  private static instance: I18n;
  private currentLanguage: Language = 'zh';
  private translations: Translations;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(os.homedir(), '.config', 'opencode', 'ocsm-lang.json');
    this.translations = loadTranslations('zh');
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
    } catch {
      // use default language
    }
  }

  saveLanguage(lang: Language): void {
    this.currentLanguage = lang;
    this.translations = loadTranslations(lang);
    
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
    this.translations = loadTranslations(lang);
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
        return key;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    if (params) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey] !== undefined ? String(params[paramKey]) : match;
      });
    }

    return value;
  }
}

export const i18n = I18n.getInstance();
