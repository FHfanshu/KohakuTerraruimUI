# KohakuTerrarium UI 调试指南

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│  Browser (Chrome)                                   │
│  http://localhost:5173   (Vite dev server)           │
│                                                     │
│  前端代码  ──────►  Vite Proxy (/api, /ws)           │
│                          │                           │
└──────────────────────────│───────────────────────────┘
                           │ proxy (dev only)
                           ▼
┌─────────────────────────────────────────────────────┐
│  Backend (KT)                                       │
│  http://localhost:8001   (kt web --dev)              │
│                                                     │
│  FastAPI: REST API + WebSocket                      │
└─────────────────────────────────────────────────────┘
```

## 启动步骤

### 1. 启动后端 (KT)

```bash
cd F:\AI\KohakuTerrarium

# 开发模式启动（推荐）
kt web --dev --host 127.0.0.1 --port 8001

# 或生产模式
kt web --host 127.0.0.1 --port 8001
```

后端启动后验证：
- 浏览器访问 http://127.0.0.1:8001/api/registry 应该返回 JSON
- `curl http://127.0.0.1:8001/api/agents` 应返回空数组 `[]`

### 2. 启动前端 (OpenCodeUI + KT)

```bash
cd F:\AI\KohakuTerrarium\KohakuTerraruimUI

npm run dev
```

前端启动后访问：http://localhost:5173

## Vite 代理配置

代理配置在 `vite.config.ts` 中自动生效，无需手动配置：

```typescript
proxy: {
  '/api': {
    target: 'http://127.0.0.1:8001',  // KT 后端地址
    changeOrigin: true,
    ws: true,                          // 支持 WebSocket
  },
  '/ws': {
    target: 'http://127.0.0.1:8001',
    changeOrigin: true,
    ws: true,
  },
}
```

**工作原理**：
- 前端发往 `/api/*` 的请求会自动转发到 `http://127.0.0.1:8001/api/*`
- 前端发往 `/ws/*` 的 WebSocket 连接会升级并转发到后端

**重要说明**：
- 在浏览器 Network 面板里看到请求地址是 `http://localhost:5173/api/agents` 是正常的
- `5173` 是前端开发服务器地址，Vite 会在本地把这个请求代理到 `8001`
- 所以“浏览器里显示 5173”不代表后端跑在 5173；真正的后端仍然是 `127.0.0.1:8001`
- 只有当 `localhost:5173/api/agents` 返回 404/502/连接失败时，才说明代理或后端有问题

## 常见问题排查

### 问题 1: 前端报错 "The requested module does not provide an export"

**错误信息**：
```
The requested module '/src/api/ktClient.ts' does not provide an export named 'KtAgentStatus'
```

**原因**：`KtAgentStatus` 是 TypeScript `interface`，在运行时不存在，需要 `import type`。

**修复**：确保使用 `import type { ... }` 导入纯类型。

---

### 问题 2: 前端 5173 连接不上后端 8001

**排查步骤**：

1. 确认后端在运行：
   ```bash
   # 检查端口
   netstat -ano | findstr :8001
   ```

2. 确认 Vite 代理生效：
   - 浏览器访问 http://localhost:5173/api/registry
   - 如果返回 JSON，说明代理正常
   - 如果返回 404，说明后端未启动或代理未生效
   - 如果你直接访问 http://127.0.0.1:8001/api/registry 也返回 JSON，但 `5173/api/registry` 不通，说明问题在 Vite 代理层

3. 检查 CORS / allowedHosts：
   ```typescript
   // vite.config.ts
   allowedHosts: true,  // 已配置，允许所有域名
   ```

4. 如果使用非默认端口，确保 `VITE_KT_BACKEND_URL` 环境变量正确：
   ```bash
   VITE_KT_BACKEND_URL=http://127.0.0.1:8001 npm run dev
   ```

---

### 问题 3: WebSocket 连接失败

**错误信息**：
```
WebSocket connection to 'ws://localhost:5173/ws/creatures/xxx' failed
```

**可能原因**：
1. 后端未启动
2. 代理未配置 `ws: true`
3. 防火墙拦截

**排查**：
1. 直接连接后端 WebSocket 验证：
   ```bash
   # 使用 websocat 或浏览器开发者工具连接
   ws://127.0.0.1:8001/ws/creatures/xxx
   ```
2. 检查浏览器控制台 Network 面板的 WS 连接

---

### 问题 4: 404 on content.js "Feature is disabled"

这是 Chrome 内置的 AI 功能检测通知，**不影响 KT 运行**，可以忽略。

`favicon.ico 404` 也不影响 API/WS 连接，只是站点图标没有提供。

---

### 问题 5: agent 选择页面过长，无法滚动

**修复**：重新设计的紧凑下拉选择器已实现，见 `KtSetupPanel.tsx`。

---

## API 端点参考

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/registry` | GET | 获取已注册的配置包 |
| `/api/registry/install` | POST | 安装配置包 |
| `/api/agents` | GET | 列出运行中的 agent |
| `/api/agents` | POST | 创建新 agent (`config_path` body) |
| `/api/agents/{id}` | GET | 获取 agent 详情 |
| `/api/agents/{id}/history` | GET | 获取对话历史 |
| `/api/agents/{id}/interrupt` | POST | 中断 agent |
| `/ws/creatures/{id}` | WS | Agent WebSocket 流 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_KT_BACKEND_URL` | `http://127.0.0.1:8001` | KT 后端地址 |
| `VITE_BASE_PATH` | `/` | 前端 base path |
| `TAURI_DEV_HOST` | `false` | Tauri 开发 host |
