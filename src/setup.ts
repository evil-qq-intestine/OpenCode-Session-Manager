#!/usr/bin/env node

import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { i18n, Language } from './i18n.js';

const configDir = path.join(os.homedir(), '.config', 'opencode');
const configPath = path.join(configDir, 'ocsm-lang.json');
const pluginConfigPath = path.join(configDir, 'opencode.jsonc');

async function selectLanguage(): Promise<Language> {
  const { language } = await inquirer.prompt([
    {
      type: 'list',
      name: 'language',
      message: 'Select language / 选择语言:',
      choices: [
        { name: '中文 (Chinese)', value: 'zh' },
        { name: 'English', value: 'en' },
      ],
    },
  ]);

  return language as Language;
}

async function setupPlugin(): Promise<void> {
  console.log('OCSM - OpenCode Session Manager Setup\n');

  // 1. Select language
  const language = await selectLanguage();
  i18n.setLanguage(language);

  console.log(`\n${language === 'zh' ? '[OK] 已选择中文' : '[OK] Language set to English'}\n`);

  // 2. Save language config
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify({ language }, null, 2), 'utf-8');
    console.log(`${language === 'zh' ? '[OK] 语言配置已保存' : '[OK] Language configuration saved'}\n`);
  } catch (error) {
    console.error(`${language === 'zh' ? '[FAIL] 保存语言配置失败' : '[FAIL] Failed to save language configuration'}:`, error);
  }

  // 3. Update OpenCode config
  try {
    if (fs.existsSync(pluginConfigPath)) {
      const config = JSON.parse(fs.readFileSync(pluginConfigPath, 'utf-8'));

      const pluginName = 'opencode-session-picker';
      const pluginPath = `file://${path.join(os.homedir(), '.config', 'opencode', 'plugins', 'opencode-session-picker')}`;

      if (!config.plugin) {
        config.plugin = [];
      }

      const exists = config.plugin.some((p: any) => {
        if (typeof p === 'string') {
          return p.includes(pluginName);
        }
        if (typeof p === 'object' && p.package) {
          return p.package.includes(pluginName);
        }
        return false;
      });

      if (!exists) {
        config.plugin.push(pluginPath);
        fs.writeFileSync(pluginConfigPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`${language === 'zh' ? '[OK] 插件已添加到 OpenCode 配置' : '[OK] Plugin added to OpenCode configuration'}\n`);
      } else {
        console.log(`${language === 'zh' ? '[OK] 插件已在 OpenCode 配置中' : '[OK] Plugin already in OpenCode configuration'}\n`);
      }
    } else {
      const config = {
        '$schema': 'https://opencode.ai/config.json',
        plugin: [`file://${path.join(os.homedir(), '.config', 'opencode', 'plugins', 'opencode-session-picker')}`],
      };
      fs.writeFileSync(pluginConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`${language === 'zh' ? '[OK] 已创建 OpenCode 配置文件' : '[OK] OpenCode configuration file created'}\n`);
    }
  } catch (error) {
    console.error(`${language === 'zh' ? '[FAIL] 更新 OpenCode 配置失败' : '[FAIL] Failed to update OpenCode configuration'}:`, error);
  }

  // 4. Show completion info
  console.log('='.repeat(50));
  console.log(`\n${language === 'zh' ? '[DONE] 安装完成!' : '[DONE] Installation complete!'}\n`);

  if (language === 'zh') {
    console.log('使用方法:');
    console.log('  1. 重启 OpenCode');
    console.log('  2. 使用以下命令:');
    console.log('     ocsm list         列出会话');
    console.log('     ocsm select       交互式选择');
    console.log('     ocsm resume <id>  恢复会话');
    console.log('     ocsm lang         切换语言');
    console.log('\n在 OpenCode TUI 中可以使用:');
    console.log('  - session_list   列出会话');
    console.log('  - session_search 搜索会话');
    console.log('  - session_switch 切换会话');
  } else {
    console.log('Usage:');
    console.log('  1. Restart OpenCode');
    console.log('  2. Use the following commands:');
    console.log('     ocsm list         List sessions');
    console.log('     ocsm select       Interactive selection');
    console.log('     ocsm resume <id>  Resume session');
    console.log('     ocsm lang         Switch language');
    console.log('\nIn OpenCode TUI, you can use:');
    console.log('  - session_list   List sessions');
    console.log('  - session_search Search sessions');
    console.log('  - session_switch Switch sessions');
  }

  console.log('\n' + '='.repeat(50));
}

setupPlugin().catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});
