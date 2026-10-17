// 线上启动器：把部署目录内的 MCP 凭证读入进程环境变量后启动三殿服务。
// 凭证文件 deploy-secret.env 只存在于部署副本中，不进 Git、不进前端、不打印、不写入任何响应。
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTriadServer } from './server/triad-server.mjs';
import { McpClient, loadToken, publicMessage } from './server/mcp-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const secretFile = process.env.MCD_MCP_ENV_FILE || resolve(here, 'deploy-secret.env');
const port = Number(process.env.PORT || 8780);
const hosts = String(process.env.TRIAD_ALLOWED_HOSTS || '').split(',').map(value => value.trim()).filter(Boolean);

try {
  const client = new McpClient({ token: await loadToken(secretFile) });
  const server = createTriadServer({
    client,
    access: {
      publicMode: true,
      allowedHosts: hosts,
      allowedOrigins: String(process.env.TRIAD_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
      trustProxy: true,
      rateLimit: { limit: Number(process.env.TRIAD_RATE_LIMIT || 180), windowMs: 60000 },
      maxSessionsPerIp: Number(process.env.TRIAD_SESSIONS_PER_IP || 8)
    }
  });
  server.listen(port, process.env.TRIAD_HOST || '0.0.0.0', () => console.log(`三殿线上服务已启动：端口 ${port}`));
  server.on('error', error => { console.error(publicMessage(error)); process.exitCode = 1; });
} catch (error) {
  console.error(publicMessage(error));
  process.exitCode = 1;
}
