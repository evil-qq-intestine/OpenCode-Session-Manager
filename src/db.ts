import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Session, Message, Part, SessionPreview } from './types.js';

export class OpenCodeDB {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || this.getDefaultDbPath();
  }

  private getDefaultDbPath(): string {
    const xdgData = process.env.XDG_DATA_HOME;
    if (xdgData) {
      return path.join(xdgData, 'opencode', 'opencode.db');
    }
    return path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  }

  async connect(): Promise<boolean> {
    if (!fs.existsSync(this.dbPath)) {
      console.error(`[OCSM] Database not found: ${this.dbPath}`);
      return false;
    }

    try {
      const SQL = await initSqlJs();
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
      return true;
    } catch (error: any) {
      console.error(`[OCSM] Failed to connect to database: ${error.message}`);
      console.error(`[OCSM] Error stack: ${error.stack}`);
      return false;
    }
  }

  disconnect(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private ensureConnected(): void {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
  }

  private queryAll(sql: string, params: any[] = []): any[] {
    this.ensureConnected();
    const stmt = this.db!.prepare(sql);
    stmt.bind(params);
    const results: any[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  private queryOne(sql: string, params: any[] = []): any | null {
    this.ensureConnected();
    const stmt = this.db!.prepare(sql);
    stmt.bind(params);
    let result: any = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  listSessions(limit?: number, search?: string): any[] {
    let query = `
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s 
      WHERE s.parent_id IS NULL
    `;
    const params: any[] = [];

    if (search) {
      query += ' AND (s.title LIKE ? OR s.id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY s.time_created DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return this.queryAll(query, params);
  }

  getSession(id: string): any | null {
    return this.queryOne(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s 
      WHERE s.id = ?
    `, [id]);
  }

  getSessionMessages(sessionId: string, limit?: number): any[] {
    let query = 'SELECT * FROM message WHERE session_id = ? ORDER BY time_created ASC';
    const params: any[] = [sessionId];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return this.queryAll(query, params);
  }

  getMessageParts(messageId: string): any[] {
    return this.queryAll('SELECT * FROM part WHERE message_id = ?', [messageId]);
  }

  searchSessionsByTitle(query: string): any[] {
    const searchQuery = `
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s
      WHERE s.parent_id IS NULL 
        AND (s.title LIKE ? OR s.id LIKE ?)
      ORDER BY s.time_created DESC
    `;

    const searchTerm = `%${query}%`;
    return this.queryAll(searchQuery, [searchTerm, searchTerm]);
  }

  searchSessions(query: string): any[] {
    const searchQuery = `
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s
      WHERE s.parent_id IS NULL 
        AND s.id IN (
          SELECT DISTINCT session_id FROM message WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT DISTINCT session_id FROM part WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT id FROM session WHERE id = s.id AND title LIKE ?
        )
      ORDER BY s.time_created DESC
    `;

    const searchTerm = `%${query}%`;
    return this.queryAll(searchQuery, [searchTerm, searchTerm, searchTerm]);
  }

  searchSessionsWithRelevance(query: string): any[] {
    const searchQuery = `
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count,
        CASE 
          WHEN s.title LIKE ? THEN 3
          WHEN s.id LIKE ? THEN 2
          ELSE 1
        END as relevance
      FROM session s
      WHERE s.parent_id IS NULL 
        AND s.id IN (
          SELECT DISTINCT session_id FROM message WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT DISTINCT session_id FROM part WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT id FROM session WHERE id = s.id AND title LIKE ?
        )
      ORDER BY relevance DESC, s.time_created DESC
    `;

    const searchTerm = `%${query}%`;
    return this.queryAll(searchQuery, [
      searchTerm, searchTerm,
      searchTerm, searchTerm, searchTerm
    ]);
  }

  getSessionsWithPreview(limit?: number): SessionPreview[] {
    const sessions = this.listSessions(limit);
    
    return sessions.map(session => {
      const messages = this.getSessionMessages(session.id, 1);
      let preview = '';
      
      if (messages.length > 0) {
        const parts = this.getMessageParts(messages[0].id);
        const textParts = parts.filter((p: any) => p.type === 'text');
        if (textParts.length > 0) {
          try {
            const data = JSON.parse(textParts[0].data);
            preview = (data.text || '').substring(0, 100);
          } catch {
            preview = textParts[0].data?.substring(0, 100) || '';
          }
        }
      }

      return {
        id: session.id,
        title: session.title || 'Untitled',
        messageCount: session.message_count || 0,
        createdAt: new Date(session.time_created * 1000),
        updatedAt: new Date(session.time_updated * 1000),
        preview,
      };
    });
  }

  deleteSession(id: string): boolean {
    this.ensureConnected();

    try {
      this.db!.run('DELETE FROM part WHERE session_id IN (SELECT id FROM session_message WHERE session_id = ?)', [id]);
      this.db!.run('DELETE FROM session_message WHERE session_id = ?', [id]);
      this.db!.run('DELETE FROM session WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error(`Failed to delete session: ${error}`);
      return false;
    }
  }

  exportSession(sessionId: string): any {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const messages = this.getSessionMessages(sessionId);
    const messagesWithParts = messages.map((msg: any) => ({
      ...msg,
      parts: this.getMessageParts(msg.id),
    }));

    return {
      session,
      messages: messagesWithParts,
      exportedAt: new Date().toISOString(),
    };
  }

  exportAllSessions(): any[] {
    const sessions = this.listSessions();
    return sessions.map((session: any) => this.exportSession(session.id)).filter(Boolean);
  }
}

export function getDBPath(): string {
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    return path.join(xdgData, 'opencode', 'opencode.db');
  }
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
}
