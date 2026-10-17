import { readFile } from 'node:fs/promises';

export const MCP_ENDPOINT = 'https://mcp.mcd.cn';
export const READ_TOOLS = Object.freeze(['query-nearby-stores', 'query-meals', 'query-meal-detail', 'query-store-coupons', 'calculate-price']);
export const DEFAULT_ENV_FILE = 'G:/WorkBuddy/secrets/mcmultiverse-mcp.env';

export function publicMessage(value, token = '') {
  let message = String(value?.message || value || 'MCP 请求失败');
  if (token) message = message.split(token).join('[已隐藏凭证]');
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]').replace(/\b1[3-9]\d{9}\b/g, '[已隐藏手机号]').replace(/((?:token|couponCode|couponId|authorization|membershipCode|userId|customerId)["']?\s*[=:]\s*)["']?[^\s,;}"']+["']?/gi, '$1[已隐藏]').slice(0, 700);
}

export async function loadToken(envFile = DEFAULT_ENV_FILE) {
  if (process.env.MCD_MCP_TOKEN?.trim()) return process.env.MCD_MCP_TOKEN.trim();
  let source;
  try { source = await readFile(envFile, 'utf8'); } catch { throw Error('未找到项目外的 MCP 凭证文件，请配置 MCD_MCP_TOKEN。'); }
  const line = source.split(/\r?\n/).find(value => /^\s*(?:export\s+)?MCD_MCP_TOKEN\s*=/.test(value));
  const token = line?.replace(/^\s*(?:export\s+)?MCD_MCP_TOKEN\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!token) throw Error('MCP 凭证未配置：需要 MCD_MCP_TOKEN。');
  return token;
}

export function parseMcpResponse(text, contentType = '') {
  if (contentType.includes('text/event-stream') || /^\s*(?:event:|data:)/.test(text)) {
    const blocks = text.replace(/\r\n/g, '\n').split('\n\n');
    const messages = blocks.flatMap(block => {
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return [];
      try { return [JSON.parse(data)]; } catch { throw Error('MCP 返回的 SSE 数据不是有效 JSON。'); }
    });
    return messages.findLast(message => message.result !== undefined || message.error !== undefined) || messages.at(-1);
  }
  try { return JSON.parse(text); } catch { throw Error('MCP 返回的内容不是有效 JSON。'); }
}

export function unwrapTool(result) {
  if (result?.isError) {
    const message = (result.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
    let parsed; try { parsed = JSON.parse(message); } catch { /* Plain Tool error text is retained after redaction by the caller. */ }
    throw Error(parsed ? parsed.message || parsed.error?.message || 'MCP Tool 执行失败。' : message || 'MCP Tool 执行失败。');
  }
  let payload = result?.structuredContent;
  if (!payload) {
    const content = (result?.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
    try { payload = JSON.parse(content); } catch { throw Error('MCP Tool 未返回可核验的结构化结果。'); }
  }
  if (payload?.code !== undefined && ![0, 200, '0', '200'].includes(payload.code)) throw Error(payload.message || `MCP 业务响应失败 (${payload.code})。`);
  if (payload?.data === undefined) throw Error(payload?.message || 'MCP Tool 结果缺少 data。');
  return payload;
}

export class McpClient {
  constructor({ token, fetchImpl = fetch, timeoutMs = 25000 } = {}) {
    if (typeof token !== 'string' || !token.trim()) throw Error('MCP Token 未配置。');
    this.token = token.trim(); this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs;
    this.session = ''; this.nextId = 1; this.protocolVersion = '2024-11-05'; this.ready = null; this.tools = [];
  }
  async rpc(method, params, notification = false) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${this.token}`, 'MCP-Protocol-Version': this.protocolVersion };
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    const body = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}), ...(!notification ? { id: this.nextId++ } : {}) };
    try {
      const response = await this.fetchImpl(MCP_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error' });
      const session = response.headers.get('mcp-session-id'); if (session) this.session = session;
      if (!response.ok) throw Error(`MCP HTTP ${response.status}：${(await response.text()).slice(0, 400)}`);
      if (notification && [202, 204].includes(response.status)) return;
      const reader = response.body?.getReader(); let text = '';
      if (reader) {
        const decoder = new TextDecoder(); let size = 0;
        while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4 * 1024 * 1024) { await reader.cancel(); throw Error('MCP 响应超过允许大小。'); } text += decoder.decode(part.value, { stream: true }); } text += decoder.decode();
      } else text = await response.text();
      if (!text.trim() && notification) return;
      const message = parseMcpResponse(text, response.headers.get('content-type') || '');
      if (message?.error) throw Error(message.error.message || 'MCP JSON-RPC 请求失败。');
      if (!message || (!notification && message.id !== body.id)) throw Error('MCP 响应 ID 不匹配。');
      return message.result;
    } catch (error) { throw Error(publicMessage(error?.name === 'TimeoutError' ? 'MCP 请求超时，请重试。' : error, this.token)); }
  }
  async connect() {
    if (!this.ready) this.ready = (async () => {
      const init = await this.rpc('initialize', { protocolVersion: this.protocolVersion, capabilities: {}, clientInfo: { name: 'mcmultiverse-local-triad', version: '1.0.0' } });
      if (init?.protocolVersion) this.protocolVersion = init.protocolVersion;
      await this.rpc('notifications/initialized', undefined, true);
      const listed = await this.rpc('tools/list', {}); this.tools = listed?.tools?.map(tool => tool.name) || [];
      if (READ_TOOLS.some(name => !this.tools.includes(name))) throw Error('官方 MCP 当前缺少本试玩所需的只读工具。');
      return { connected: true, tools: [...READ_TOOLS], checkedAt: new Date().toISOString(), server: init?.serverInfo?.name || 'mcd-mcp' };
    })().catch(error => { this.ready = null; throw error; });
    return this.ready;
  }
  async call(name, argumentsValue) {
    if (!READ_TOOLS.includes(name)) throw Error('该 Tool 不在只读白名单中。');
    await this.connect();
    try { return unwrapTool(await this.rpc('tools/call', { name, arguments: argumentsValue })); }
    catch (error) { throw Error(publicMessage(error, this.token)); }
  }
}
