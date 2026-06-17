import { spawn } from 'node:child_process';

export const runtime = 'nodejs';

interface PickResult {
  path?: string;
  cancelled?: boolean;
  error?: string;
}

// 调起系统原生「选择文件夹」对话框(仅 macOS osascript),返回所选目录绝对路径。
// dashboard 本地运行 = 以当前用户身份在其桌面弹窗;非 mac 平台返回 unsupported,前端回退手填。
export async function POST(): Promise<Response> {
  if (process.platform !== 'darwin') {
    return Response.json({ ok: false, error: 'unsupported' }, { status: 501 });
  }

  const result = await chooseFolder();
  if (result.cancelled) return Response.json({ ok: true, cancelled: true });
  if (result.error) return Response.json({ ok: false, error: result.error }, { status: 500 });
  return Response.json({ ok: true, path: result.path });
}

// 取 `choose folder` 的 POSIX 绝对路径;用户取消时 osascript 以 -128 退出,归入 cancelled。
function chooseFolder(): Promise<PickResult> {
  return new Promise(resolve => {
    const script = 'POSIX path of (choose folder with prompt "Select a project directory")';
    const child = spawn('osascript', ['-e', script]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', err => resolve({ error: err.message }));
    child.on('close', code => {
      if (code === 0) {
        const path = stdout.trim();
        resolve({ path: path.length > 1 ? path.replace(/\/$/, '') : path });
      } else if (/User canceled|-128/.test(stderr)) {
        resolve({ cancelled: true });
      } else {
        resolve({ error: stderr.trim() || `osascript exited ${code}` });
      }
    });
  });
}
