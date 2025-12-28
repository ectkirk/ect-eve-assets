import type { ServerResponse } from 'node:http'

export const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ECT EVE Assets - Login Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
    }
    .container {
      text-align: center;
      padding: 48px 64px;
      background: #1e293b;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    .brand {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 24px;
    }
    .brand .accent { color: #3b82f6; }
    .status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #10b981;
      font-size: 18px;
      margin-bottom: 12px;
    }
    .check {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0f172a;
      font-weight: bold;
    }
    p { color: #94a3b8; font-size: 14px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand"><span class="accent">ECT</span> EVE Assets</div>
    <div class="status"><span class="check">✓</span> Login Successful</div>
    <p>You can close this tab and return to the application.</p>
  </div>
  <script>window.close();</script>
</body>
</html>`

export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return str.replace(/[&<>"']/g, (c) => map[c]!)
}

export const ERROR_HTML = (error: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ECT EVE Assets - Login Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
    }
    .container {
      text-align: center;
      padding: 48px 64px;
      background: #1e293b;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    .brand {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 24px;
    }
    .brand .accent { color: #3b82f6; }
    .status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #f87171;
      font-size: 18px;
      margin-bottom: 12px;
    }
    .x-mark {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #f87171;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0f172a;
      font-weight: bold;
    }
    p { color: #94a3b8; font-size: 14px; margin: 0; }
    .error { color: #fca5a5; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand"><span class="accent">ECT</span> EVE Assets</div>
    <div class="status"><span class="x-mark">✗</span> Login Failed</div>
    <p>Please close this tab and try again.</p>
    <p class="error">${escapeHtml(error)}</p>
  </div>
</body>
</html>`

export function sendHtmlResponse(
  res: ServerResponse,
  statusCode: number,
  html: string
): void {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}
