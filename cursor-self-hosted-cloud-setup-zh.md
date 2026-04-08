# Cursor Self-Hosted Cloud Agents 搭建指南

手把手教你把 Cursor 的 cloud agent 跑在自己的机器上，code、构建产物、secrets 全部留在你自己的网络里，一行都不外泄。

---

## 目录

1. [这玩意儿是啥](#这玩意儿是啥)
2. [开搞之前你需要什么](#开搞之前你需要什么)
3. [第一步：在 Dashboard 里打开开关](#第一步在-dashboard-里打开开关)
4. [第二步：单机启动 Worker](#第二步单机启动-worker)
5. [第三步：用 Kubernetes 扩容](#第三步用-kubernetes-扩容)
6. [第四步：非 Kubernetes 环境](#第四步非-kubernetes-环境)
7. [环境配置](#环境配置)
8. [Secrets 管理](#secrets-管理)
9. [网络与安全](#网络与安全)
10. [进阶配置](#进阶配置)
11. [踩坑指南](#踩坑指南)
12. [相关链接](#相关链接)

---

## 这玩意儿是啥

Cursor cloud agent 本质上就是一个跑在隔离 VM 里的自动化开发者——它自带 terminal、browser、完整桌面，能自己 clone repo、装依赖、写 code、跑测试、push 代码、开 PR，全程不需要你盯着。

但默认情况下，这些 VM 跑在 Cursor 的云上。如果你的公司对安全合规有要求（比如金融、医疗），或者你的开发环境依赖内网的 cache 和私有 registry，那就需要 **self-hosted** 模式——同样的功能，但 worker 跑在 **你自己的机器** 上。

### 核心逻辑

```
┌────────────────────────┐       HTTPS（仅出站）        ┌──────────────────────┐
│  你的基础设施          │  ─────────────────────────►  │  Cursor Cloud        │
│                        │                              │                      │
│  ┌──────────────────┐  │  ◄─────────────────────────  │  推理 & 规划         │
│  │  Worker 进程     │  │      tool calls / 结果       │  Model 调用          │
│  │                  │  │                              │  用户界面            │
│  │  - clone repo    │  │                              │                      │
│  │  - 跑测试        │  │                              └──────────────────────┘
│  │  - build code    │  │
│  └──────────────────┘  │
└────────────────────────┘
```

简单说就是：

- **Cursor Cloud** 负责模型推理、任务规划、给你好看的 UI
- **你的 Worker** 负责实际干活：clone、build、test、push
- 两边靠 HTTPS 通信，worker 只往外连，**不需要开入站端口**，也不用改防火墙或搞 VPN

你的 code 和构建产物全程待在你的网络里，一点都不会漏出去。

---

## 开搞之前你需要什么

| 条件 | 说明 |
|------|------|
| **Cursor 订阅** | Pro、Business 或 Enterprise，得支持 cloud agent |
| **Dashboard 权限** | 能访问 https://cursor.com/dashboard/cloud-agents |
| **一台机器** | 或者一个 Kubernetes 集群，用来跑 worker |
| **Cursor CLI** | 装了 Cursor IDE 就自带 `agent` 命令 |
| **网络** | 能出站访问 HTTPS 就行，不需要开入站端口 |

> **划重点：** 用个人 API key 或浏览器登录启动的 worker 会注册为 **个人** worker。想搞团队共享的 worker pool，得用 service account API key——这个只有 Enterprise plan 才有。Team plan 的同学想用共享池子，目前只能升级或找 Cursor 销售聊。

---

## 第一步：在 Dashboard 里打开开关

1. 打开 **https://cursor.com/dashboard/cloud-agents**
2. 找到 **Self-Hosted** 区块，把 **"Enable self-hosted pool"** 的开关拨成开
3. 搞定。Cursor 之后就会把 agent 任务路由到你自己的 worker 上

Dashboard 里还能顺手配一些默认值：

- **Default Model**：没指定 model 时用哪个（比如 Sonnet 4.5）
- **Default Repository**：默认 repo
- **Base Branch**：默认 base branch
- **Branch Prefix**：agent 自动创建的 branch 前缀（比如 `cursor/`）
- **Create PRs**：agent 干完活是否自动开 PR

---

## 第二步：单机启动 Worker

最简单的搞法，一行命令：

```bash
agent worker start
```

这条命令会：
- 起一个 worker 进程，专门接 agent 任务
- 通过 HTTPS 出站连接 Cursor Cloud
- 在本地执行所有 tool call（clone repo、跑 shell 命令、读写文件等）

### Worker 模式

两种跑法，按需选择：

- **常驻模式（Long-lived）**：worker 一直挂着，持续接活
- **一次性模式（Single-use）**：干完一个任务就自动退出，适合 CI/CD 场景

### 认证方式

启动 worker 的时候需要认证身份，三种方式：

| 方式 | 适用场景 |
|------|----------|
| **浏览器登录** | 交互式 OAuth，会弹浏览器，适合本地开发 |
| **Personal API Key** | 无头/自动化场景，不用开浏览器 |
| **Service Account API Key** | Enterprise 专属，注册为团队共享 worker |

---

## 第三步：用 Kubernetes 扩容

如果你要搞几百上千个 worker，手动一个个 `agent worker start` 肯定不现实。Cursor 提供了 **Helm chart** 和 **Kubernetes operator**，帮你自动管理 worker 集群。

### 装 Helm Chart

```bash
helm repo add cursor https://charts.cursor.com
helm repo update

helm install cursor-agent-operator cursor/agent-operator \
  --namespace cursor-agents \
  --create-namespace
```

### 写 WorkerDeployment 配置

创建一个 `WorkerDeployment` CRD 来定义你的 worker pool：

```yaml
apiVersion: agents.cursor.com/v1
kind: WorkerDeployment
metadata:
  name: my-agent-pool
  namespace: cursor-agents
spec:
  replicas: 10
  autoscaling:
    enabled: true
    minReplicas: 5
    maxReplicas: 50
    targetUtilization: 80
  worker:
    image: cursor/agent-worker:latest
    resources:
      requests:
        cpu: "2"
        memory: "4Gi"
      limits:
        cpu: "4"
        memory: "8Gi"
    env:
      - name: CURSOR_API_KEY
        valueFrom:
          secretKeyRef:
            name: cursor-credentials
            key: api-key
```

然后一把梭：

```bash
kubectl apply -f worker-deployment.yaml
```

Kubernetes operator 会帮你搞定：
- **自动扩缩容**：根据负载自动调整 worker 数量
- **滚动更新**：升级 worker 镜像时不停服
- **生命周期管理**：启动、健康检查、自动回收，全自动

---

## 第四步：非 Kubernetes 环境

没用 K8s 也没关系，Cursor 提供了 **fleet management API**，你可以：

- 查询 worker 的利用率
- 自己写脚本搞自动扩缩容
- 在任意基础设施上管理 worker（VM、裸金属、随便什么都行）

举个例子，写个简单的自动扩容脚本：

```bash
utilization=$(curl -s https://api.cursor.com/fleet/utilization \
  -H "Authorization: Bearer $CURSOR_API_KEY" | jq '.utilization')

if (( $(echo "$utilization > 0.8" | bc -l) )); then
  agent worker start --detach
fi
```

利用率超 80% 就自动拉一个新 worker 起来，逻辑非常直白。

---

## 环境配置

在 repo 根目录放一个 `.cursor/environment.json`，可以告诉 agent 怎么搭建开发环境：

```json
{
  "image": "Dockerfile",
  "install": "npm install",
  "start": "sudo service docker start"
}
```

| 字段 | 干啥用的 |
|------|----------|
| `image` | 指向一个 Dockerfile，用来构建自定义环境 |
| `install` | 每次 session 开始前跑的安装命令（比如装依赖） |
| `start` | 启动 session 期间需要常驻的进程（比如 Docker daemon） |

### 三种玩法

1. **让 Cursor 自己搞**：它会自动检测项目类型、装依赖，省心但不一定完全符合你的需求
2. **手动配 Dockerfile**：在 `.cursor/environment.json` 里指定，完全可控
3. **走 Onboarding 流程**：访问 https://cursor.com/onboard ，交互式配置，适合初次上手

---

## Secrets 管理

千万别把 secrets commit 到 repo 里（这话说八百遍都不嫌多）。正确做法如下：

1. 打开 **Cursor Dashboard > Cloud Agents > Secrets**
2. 添加 key-value 形式的 secret
3. 这些 secret 的特性：
   - 静态加密存储
   - 以环境变量形式注入 agent session
   - 可以按 user/team 维度划分，也可以绑定到特定 repo
   - user 级别的 secret 会覆盖 team 级别的

在 MCP 配置里引用 secret 时用 `${env:VAR}` 语法，别硬编码。

---

## 网络与安全

### 连接方式

重要的事情再强调一遍：

- **只有出站连接**：worker 主动通过 HTTPS 连 Cursor Cloud
- **不需要入站端口**：防火墙不用改，VPN 不用搞
- **code 不出网**：源码和构建产物全在你的机器上
- **推理在 Cursor 端**：模型推理和任务规划走 Cursor Cloud

### Tailscale 集成

如果你的内网用了 Tailscale：

```bash
tailscaled --tun=userspace-networking &

export ALL_PROXY=socks5://localhost:1055
export HTTP_PROXY=http://localhost:1055
export HTTPS_PROXY=http://localhost:1055
```

注意用 userspace networking 模式，别用内核 TUN——在容器里跑的时候内核模式经常翻车。

### Docker-in-Docker

如果 agent 环境里需要跑 Docker：

```dockerfile
RUN apt-get update && apt-get install -y fuse-overlayfs iptables
RUN update-alternatives --set iptables /usr/sbin/iptables-legacy
```

用 `fuse-overlayfs` 做 overlay storage，兼容性比原生 overlay2 好不少，尤其是在非特权容器里。

---

## 进阶配置

### MCP Server 认证

Agent 和 MCP（Model Context Protocol）server 交互时支持多种认证方式：

| 类型 | 认证方式 |
|------|----------|
| **Stdio server** | 直接继承 agent session 的环境变量（API key / token） |
| **Streamable HTTP server** | 支持 OAuth 2.1（带 PKCE）或静态 Bearer token header |
| **Enterprise** | 用 MCP Gateway 统一管理凭据，对接 Okta / Azure AD 等 |

### Agent 的规则和指令

Agent 启动时会自动加载这些配置文件：

- `.cursor/rules/*.mdc` — 项目级别的规则
- `AGENTS.md` 或 `CLAUDE.md` — 项目级别的指令
- `.cursor/cli.json` — 项目级别的权限配置
- `~/.cursor/cli-config.json` — 全局配置

如果你想让 agent 遵守特定的 code style、commit 规范、或者禁止某些操作，往这些文件里写就对了。

### 资源上限

| Plan | 配置 |
|------|------|
| Pro | 标准 VM 规格 |
| Business | 标准 VM 规格 |
| Enterprise | 可定制（联系 Cursor 支持） |

默认的 VM 规格对一般项目足够用了，除非你在跑特别吃资源的构建任务（比如大型 C++ 项目或 ML 训练），否则不太需要升级。

---

## 踩坑指南

### Worker 卡在 "Waiting for self-hosted worker"

**症状**：在 Dashboard 里开关了某个 toggle（比如 MCP），之后 agent 就一直转圈等 worker。

**解法**：
1. 重启 worker：`agent worker start`
2. 确认 Dashboard 里 self-hosted pool 开关还是开着的
3. 检查 worker 机器能不能正常出站访问 HTTPS
4. 排查是否有 proxy 或防火墙规则把出站连接挡了

社区里有人反馈这个 bug 已经被 Cursor 团队修了，如果还遇到就更新到最新版本试试。

### Worker 注册不到团队池子里

**原因**：用个人 API key 或浏览器登录启动的 worker，只会注册为个人 worker。

**解法**：用 **service account API key** 启动。这个功能目前只有 Enterprise plan 才有，Team plan 暂时搞不了共享 pool。社区里不少人在喊这个需求，Cursor 团队说后续会支持。

### 认证挂了

排查清单：
1. API key 是不是过期了或者被 revoke 了
2. 你的 Cursor plan 是否支持 cloud agent
3. 走 OAuth 的话，确认浏览器能正常完成 callback 跳转回 IDE

---

## 相关链接

| 资源 | URL |
|------|-----|
| 官方文档：Self-Hosted | https://cursor.com/docs/cloud-agent/self-hosted |
| 官方文档：Setup | https://cursor.com/docs/cloud-agent/setup |
| 官方文档：Kubernetes 部署 | https://cursor.com/docs/cloud-agent/self-hosted-k8s |
| 官方 Blog 公告 | https://cursor.com/blog/self-hosted-cloud-agents |
| Changelog（2026-03-25） | https://cursor.com/changelog/03-25-26 |
| Dashboard | https://cursor.com/dashboard/cloud-agents |
| Onboarding | https://cursor.com/onboard |
| 联系销售（Enterprise） | https://cursor.com/contact-sales?source=self-hosted-cloud-agents-blog |
| 社区论坛 | https://forum.cursor.com |
