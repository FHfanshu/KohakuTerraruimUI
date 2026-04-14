# KohakuTerrarium UI

中文 | [English](./README_EN.md)

一个面向 [KohakuTerrarium](https://github.com/Kohaku-Lab/KohakuTerrarium) 的 Web 前端界面，当前聚焦于通过 `kt web` 提供单 agent 聊天、配置选择、会话恢复与模型切换体验。

本项目基于原有 OpenCodeUI 代码库演进而来，目前正在逐步切换为 KT 专用前端。

**本项目完全由 AI 辅助编程（Vibe Coding）完成**——从第一行代码到最终发布，所有功能均通过与 AI 对话驱动开发。

> **免责声明**：本项目仅供学习交流使用，不对因使用本项目导致的任何问题承担责任。项目处于早期阶段，可能存在 bug 和不稳定之处。

## 预览

<img width="2298" height="1495" alt="image" src="https://github.com/user-attachments/assets/dc68837b-0560-4701-b6ab-ecb13fdc1f4f" />
<img width="2296" height="1500" alt="image" src="https://github.com/user-attachments/assets/7a8d9754-69c4-49c5-99ee-6452d94f5420" />
<img width="411" height="906" alt="image" src="https://github.com/user-attachments/assets/0cfbf8b2-3fed-4e3c-8b49-1175c6e12f54" />
## 当前特性

- **KT 单 agent 聊天界面** — 对接 `kt web` 的 REST API 与 WebSocket 流
- **Agent 启动与选择** — 可选择已运行 agent，或从 registry 里的 creature 配置直接启动
- **会话恢复** — 按工作区筛选历史 session 并恢复到新的运行实例
- **模型切换** — 读取 KT 模型配置并切换当前 agent 的模型/推理强度
- **OpenCodeUI 风格消息渲染** — 复用现有消息 UI、Markdown 渲染与代码高亮能力
- **主题系统** — 保留现有主题、明暗模式和宽屏模式体验
- **浏览器开发模式** — 通过 Vite 代理 `/api` 与 `/ws` 到 `kt web --dev`
- **桌面外壳仍保留** — 代码库中仍包含 Tauri / Docker / OpenCodeUI 遗留能力，但 README 以下部分未完全迁移前，请视为历史内容

## 技术栈

| 类别     | 技术                           |
| -------- | ------------------------------ |
| 框架     | React 19 + TypeScript          |
| 构建     | Vite 7                         |
| 样式     | Tailwind CSS v4                |
| 代码高亮 | Shiki                          |
| 终端     | xterm.js (WebGL)               |
| Markdown | react-markdown + remark-gfm    |
| 桌面     | Tauri 2                        |
| 部署     | Docker (Caddy + Python Router) |

## 快速开始

先启动 KohakuTerrarium 后端：

```bash
cd F:\AI\KohakuTerrarium
kt web --dev --host 127.0.0.1 --port 8001
```

再启动前端：

```bash
cd F:\AI\KohakuTerrarium\KohakuTerraruimUI
npm install
npm run dev
```

然后打开 `http://localhost:5173`。

开发环境下，Vite 会把 `/api` 和 `/ws` 代理到 `http://127.0.0.1:8001`。如需修改后端地址，可设置 `VITE_KT_BACKEND_URL`。

## Docker 部署（纯前端）

适用于已有 `opencode serve` 在运行的场景，只需一个前端 UI 容器连接到现有后端。

```bash
git clone https://github.com/lehhair/OpenCodeUI.git
cd OpenCodeUI

# 启动（默认连接宿主机的 opencode serve :4096）
docker compose -f docker-compose.standalone.yml up -d
```

访问 `http://localhost:3000`。

**连接远程后端：**

```bash
BACKEND_URL=your-server.com:4096 PORT=8080 docker compose -f docker-compose.standalone.yml up -d
```

| 环境变量      | 默认值                      | 说明                                |
| ------------- | --------------------------- | ----------------------------------- |
| `BACKEND_URL` | `host.docker.internal:4096` | opencode serve 地址（不含协议前缀） |
| `PORT`        | `3000`                      | 前端监听端口                        |

## Docker 部署

### 架构与端口

部署包含三个服务，由 Gateway 统一对外：

| 服务     | 端口                   | 说明                           |
| -------- | ---------------------- | ------------------------------ |
| Gateway  | 6658（`GATEWAY_PORT`） | 统一入口，反代所有请求         |
| Gateway  | 6659（`PREVIEW_PORT`） | 开发服务预览专用               |
| Frontend | 3000（内部）           | 静态前端                       |
| Backend  | 4096（内部）           | OpenCode API                   |
| Router   | 7070（内部）           | 动态端口路由（内置于 Gateway） |

### Gateway 路由规则

端口 `6658` 上的请求按以下规则转发：

| 路径         | 转发目标       | 说明                   |
| ------------ | -------------- | ---------------------- |
| `/api/*`     | Backend :4096  | OpenCode API，支持 SSE |
| `/routes`    | Router :7070   | 动态路由管理面板       |
| `/preview/*` | Router :7070   | 预览端口切换 API       |
| 其他         | Frontend :3000 | 前端静态资源           |

端口 `6659` 用于访问容器内开发服务，Router 自动扫描 `3000-9999` 端口，通过 `/p/{token}/` 路径生成预览链接。

### 部署步骤

```bash
git clone https://github.com/lehhair/OpenCodeUI.git
cd OpenCodeUI

# 复制并编辑环境变量，至少填写一个 LLM API Key
cp .env.example .env

# 启动
docker compose up -d
```

访问 `http://localhost:6658`。

### 环境持久化（简化版）

现在后端只保留一个核心持久化卷：`opencode-home`（挂载到 `/root`）。

后端入口脚本会在启动时自动校验并补齐 `opencode` / `mise`，避免容器重建后工具链丢失。

- OpenCode 配置与会话缓存
- npm / cargo / pip 等用户态缓存
- 通过 `mise` 安装的 Node / Python 多版本运行时

容器重建后，上述内容都会保留，不需要再拆成多个小卷。

从旧版本升级时，原来的 `opencode-data/opencode-config/opencode-cache/opencode-npm/opencode-cargo/opencode-local/opencode-opt` 会变成孤立卷，可在确认数据已迁移后手动清理。

首次进入后端容器可直接安装并固化运行时版本：

```bash
docker compose exec backend mise use -g node@22 python@3.12
docker compose exec backend node -v
docker compose exec backend python -V
```

`gateway` 仍保留单独卷 `opencode-router-data`，用于存放动态路由状态。

### 环境变量

编辑 `.env` 文件，关键配置：

```env
# LLM API Key（至少填一个）
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# 端口
GATEWAY_PORT=6658
PREVIEW_PORT=6659

# 工作目录（挂载到容器 /workspace）
WORKSPACE=./workspace

# 公网部署务必设置
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=your-strong-password

# 路由服务
ROUTER_SCAN_INTERVAL=5
ROUTER_PORT_RANGE=3000-9999
ROUTER_EXCLUDE_PORTS=4096
```

### 反向代理

Docker 默认监听 `127.0.0.1`，公网部署需在前面加反向代理。

**Nginx：**

```nginx
server {
    listen 443 ssl;
    server_name opencode.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:6658;
        proxy_http_version 1.1;

        # SSE（必须）
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;

        # WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }
}

# 预览（可选，建议绑独立域名）
server {
    listen 443 ssl;
    server_name preview.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:6659;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}
```

**Caddy：**

```caddyfile
opencode.example.com {
    reverse_proxy 127.0.0.1:6658 {
        flush_interval -1
    }
}

preview.example.com {
    reverse_proxy 127.0.0.1:6659
}
```

> **重要**：SSE 要求禁用缓冲。Nginx 需 `proxy_buffering off`，Caddy 需 `flush_interval -1`。

## 本地开发

需要一个运行中的 KohakuTerrarium Web 后端。

```bash
cd F:\AI\KohakuTerrarium
kt web --dev --host 127.0.0.1 --port 8001

# 另一个终端
cd F:\AI\KohakuTerrarium\KohakuTerraruimUI
npm install
npm run dev
```

Vite 启动在 `http://localhost:5173`，默认会把 `/api` 和 `/ws` 自动代理到 `http://127.0.0.1:8001`。

更详细的调试说明见 `DEBUG_GUIDE.md`。

### 提交前校验

提交 PR 前，建议先在本地跑一遍和 CI 相同的校验：

```bash
npm run validate
```

这条命令会顺序执行 TypeScript 检查、ESLint、单元测试和生产构建。

如果你习惯 `type-check` 这个命名，也可以使用：

```bash
npm run type-check
```

GitHub Actions 的 `Build Validation` workflow 会在 PR 和 `main` 分支 push 时运行同一套校验。

### 发版准备

正式发版时，优先使用下面这条命令，它会先跑完整校验，再执行版本号和 changelog 更新：

```bash
npm run release:prepare -- 0.2.0
```

命令完成后，再按提示执行 `git commit`、`git tag` 和 `git push`。

## 桌面应用

从 [Releases](https://github.com/lehhair/OpenCodeUI/releases) 下载安装包，或本地构建：

```bash
npm install
npm run tauri build
```

## 项目结构

```
src/
├── api/                 # API 请求封装（含 KT REST / WS 客户端）
├── components/          # 通用组件（消息、菜单、对话框等）
├── features/            # 业务模块
│   ├── chat/            #   复用的聊天输入/模型选择/侧边栏组件
│   ├── kt/              #   KT 专用 setup/chat 视图
│   ├── message/         #   消息渲染
│   ├── settings/        #   设置面板
│   ├── mention/         #   @ 提及
│   └── slash-command/   #   斜杠命令
├── hooks/               # 自定义 Hooks（含 useKtAgent / useKtModels / useKtSessions）
├── store/               # 状态管理
├── themes/              # 主题预设
└── utils/               # 工具函数

src-tauri/               # Tauri 桌面应用（遗留，未完全切换到 KT）
docker/                  # Docker 配置（大部分仍是上游 OpenCodeUI 方案）
```

## 设计说明

当前 UI 视觉风格仍明显继承自 OpenCodeUI，交互与数据流则开始转向 KohakuTerrarium 的 `kt web` API。

README 中与 Docker、Tauri、OpenCode 后端强相关的部分仍有历史遗留，若与当前 KT 浏览器开发流不一致，请以 `DEBUG_GUIDE.md`、`vite.config.ts` 与 `src/KtApp.tsx` 为准。

部分 UI 风格参考了 [Claude](https://claude.ai) 的界面设计。

## 许可证

[GPL-3.0](./LICENSE)

## Star History

<a href="https://www.star-history.com/#lehhair/OpenCodeUI&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=lehhair/OpenCodeUI&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=lehhair/OpenCodeUI&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=lehhair/OpenCodeUI&type=Date" />
 </picture>
</a>

---

_本项目由 Vibe Coding 驱动开发，如果你也对 AI 辅助编程感兴趣，欢迎交流。_
