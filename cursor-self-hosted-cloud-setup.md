# Cursor Self-Hosted Cloud Agents: Setup Guide

This guide covers how to set up Cursor's self-hosted cloud agents so that your code, tool execution, and build artifacts stay entirely within your own infrastructure.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Enable Self-Hosted Agents in the Dashboard](#step-1-enable-self-hosted-agents-in-the-dashboard)
4. [Step 2: Start a Worker (Single Machine)](#step-2-start-a-worker-single-machine)
5. [Step 3: Scaling with Kubernetes](#step-3-scaling-with-kubernetes)
6. [Step 4: Non-Kubernetes Environments](#step-4-non-kubernetes-environments)
7. [Environment Configuration](#environment-configuration)
8. [Secrets Management](#secrets-management)
9. [Networking and Security](#networking-and-security)
10. [Advanced Configuration](#advanced-configuration)
11. [Troubleshooting](#troubleshooting)
12. [References](#references)

---

## Overview

Cursor cloud agents run in isolated virtual machines, each with a terminal, browser, and full desktop. They clone your repo, set up the dev environment, write and test code, push changes for review, and keep working whether or not you're online.

**Self-hosted cloud agents** offer the same capabilities but run on **your** infrastructure. This means:

- Your codebase, build outputs, and secrets never leave your network.
- Agents have access to your internal caches, dependencies, and network endpoints.
- No inbound ports, firewall changes, or VPN tunnels are required — workers initiate outbound HTTPS connections to Cursor's cloud.
- Cursor handles orchestration, model access, and the user experience; your machines handle execution.

### How It Works

```
┌──────────────────────┐          HTTPS (outbound)          ┌──────────────────────┐
│   Your Infrastructure │  ──────────────────────────────►  │   Cursor Cloud       │
│                        │                                   │                      │
│   ┌────────────────┐  │  ◄──────────────────────────────  │  Inference & Planning│
│   │  Worker Process │  │       Tool calls / Results        │  Model Access        │
│   │                  │  │                                   │  User Experience     │
│   │  - Clones repo   │  │                                   │                      │
│   │  - Runs tests    │  │                                   └──────────────────────┘
│   │  - Builds code   │  │
│   └────────────────┘  │
└──────────────────────┘
```

When a user triggers an agent session, Cursor's harness handles inference and planning, then sends tool calls to the worker for local execution. Results flow back to Cursor for the next round of inference.

---

## Prerequisites

| Requirement              | Details                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| **Cursor Plan**          | Pro, Business, or Enterprise plan with cloud agent access               |
| **Dashboard Access**     | Access to https://cursor.com/dashboard/cloud-agents                     |
| **Infrastructure**       | A machine (or Kubernetes cluster) to host worker processes              |
| **Cursor CLI**           | The `agent` command, bundled with Cursor IDE installation               |
| **Network**              | Outbound HTTPS access to Cursor's cloud (no inbound ports required)     |

> **Note on Team vs. Enterprise plans:** Running a self-hosted agent with browser login or a personal API key registers it as a **personal** worker. For a **team-shared worker pool**, you need service account API keys, which are available on the Enterprise plan.

---

## Step 1: Enable Self-Hosted Agents in the Dashboard

1. Navigate to **https://cursor.com/dashboard/cloud-agents**
2. Under the **Self-Hosted** section, toggle **"Enable self-hosted pool"** to ON
   - This creates a personal pool of workers for your account
3. The toggle enables Cursor to route agent sessions to your self-hosted workers instead of (or in addition to) Cursor-hosted VMs

The screenshot below shows the relevant dashboard section:

- **Enable self-hosted pool**: Toggle to create a personal pool of workers
- **Defaults**: Configure default model, repository, base branch, and branch prefix
- **Pull Requests**: Configure auto-creation behavior

---

## Step 2: Start a Worker (Single Machine)

For a quick start or small-scale deployment, you can run a single worker on any machine:

```bash
agent worker start
```

This command:
- Initiates a dedicated worker process for agent sessions
- Connects outbound via HTTPS to Cursor's cloud
- Handles tool call execution locally on your machine

### Worker Modes

Workers can be configured as:

- **Long-lived**: The worker stays running and accepts sessions indefinitely
- **Single-use**: The worker tears down after completing a single task

### Authentication

When starting a worker, you authenticate via one of:
- **Browser login**: Interactive OAuth flow through the Cursor IDE
- **Personal API key**: For headless/automated setups
- **Service account API key** (Enterprise): For team-shared worker pools

---

## Step 3: Scaling with Kubernetes

For organizations scaling to hundreds or thousands of workers, Cursor provides a **Helm chart** and **Kubernetes operator**.

### Install the Helm Chart

```bash
# Add the Cursor Helm repository (check docs for exact URL)
helm repo add cursor https://charts.cursor.com
helm repo update

# Install the operator
helm install cursor-agent-operator cursor/agent-operator \
  --namespace cursor-agents \
  --create-namespace
```

### Define a WorkerDeployment

Create a `WorkerDeployment` custom resource to manage your pool:

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

The Kubernetes operator handles:
- **Scaling**: Automatically adjusts pool size based on demand
- **Rolling updates**: Seamless updates to worker images
- **Lifecycle management**: Handles worker startup, health checks, and teardown

### Apply the Resource

```bash
kubectl apply -f worker-deployment.yaml
```

---

## Step 4: Non-Kubernetes Environments

If you're not using Kubernetes, Cursor provides a **fleet management API** to:

- Monitor worker utilization
- Implement custom autoscaling logic
- Manage worker lifecycle on any infrastructure (VMs, bare metal, etc.)

You can build autoscaling scripts that poll the fleet API and start/stop workers based on demand:

```bash
# Example: check utilization and scale
utilization=$(curl -s https://api.cursor.com/fleet/utilization \
  -H "Authorization: Bearer $CURSOR_API_KEY" | jq '.utilization')

if (( $(echo "$utilization > 0.8" | bc -l) )); then
  agent worker start --detach
fi
```

---

## Environment Configuration

Cursor agents can be configured via a `.cursor/environment.json` file in your repository:

```json
{
  "image": "Dockerfile",
  "install": "npm install",
  "start": "sudo service docker start"
}
```

| Field       | Purpose                                                                      |
|-------------|------------------------------------------------------------------------------|
| `image`     | Path to a Dockerfile for custom environment setup                            |
| `install`   | Command to install/update dependencies (runs before each session)            |
| `start`     | Command to start long-running processes needed during the session            |

### Options for Environment Setup

1. **Let Cursor set it up**: Cursor automatically detects and installs dependencies
2. **Manual configuration**: Use a Dockerfile specified in `.cursor/environment.json`
3. **Onboarding flow**: Use https://cursor.com/onboard to configure environments interactively

---

## Secrets Management

Manage API keys and credentials through the Cursor Dashboard:

1. Go to **Cursor Dashboard > Cloud Agents > Secrets**
2. Add secrets as key-value pairs
3. Secrets are:
   - Encrypted at rest
   - Injected as environment variables into agent sessions
   - Scoped to user/team and optionally to specific repositories
   - User secrets override team secrets

> **Best Practice**: Never commit secrets to your repository. Use the Dashboard secrets management or reference environment variables in your MCP configuration using `${env:VAR}` syntax.

---

## Networking and Security

### Connectivity

- **Outbound only**: Workers connect outbound via HTTPS to Cursor's cloud
- **No inbound ports**: No firewall changes or VPN tunnels required
- **No code leaves your network**: Source code and build artifacts stay on your machines
- **Inference stays on Cursor**: Model access and planning happen on Cursor's infrastructure

### Tailscale Integration

If your environment requires Tailscale for network access:

```bash
# Use userspace networking mode
tailscaled --tun=userspace-networking &

# Configure proxy variables
export ALL_PROXY=socks5://localhost:1055
export HTTP_PROXY=http://localhost:1055
export HTTPS_PROXY=http://localhost:1055
```

### Docker Support

For environments requiring Docker-in-Docker or complex container setups:

```dockerfile
# In your Dockerfile for agent environment
RUN apt-get update && apt-get install -y fuse-overlayfs iptables

# Use fuse-overlayfs for better compatibility
RUN update-alternatives --set iptables /usr/sbin/iptables-legacy
```

---

## Advanced Configuration

### MCP Server Authentication

Agents can authenticate with MCP (Model Context Protocol) servers in multiple ways:

- **Stdio servers**: Inherit environment variables (API keys/tokens) from the agent session
- **Streamable HTTP servers**: Support OAuth 2.1 (with PKCE) or static Bearer token headers
- **Enterprise**: Use an MCP Gateway to centralize credential management

### Agent Rules and Instructions

Agents automatically load configuration from:
- `.cursor/rules/*.mdc` — Project-level rules
- `AGENTS.md` or `CLAUDE.md` — Project-level instructions
- `.cursor/cli.json` — Project-level permissions
- `~/.cursor/cli-config.json` — Global settings

### Resource Limits

| Plan       | Default Resources                          |
|------------|--------------------------------------------|
| Pro        | Standard VM profile                        |
| Business   | Standard VM profile                        |
| Enterprise | Custom profiles available (contact support)|

---

## Troubleshooting

### Worker Stuck on "Waiting for self-hosted worker"

**Symptoms**: After enabling/disabling toggles (like MCP) in the dashboard, the agent hangs waiting for a worker.

**Solutions**:
1. Restart the worker process: `agent worker start`
2. Check that self-hosted pool is still enabled in the dashboard
3. Verify outbound HTTPS connectivity from your worker machine
4. Check for any proxy or firewall rules blocking outbound connections

### Worker Won't Register as Team Pool

**Cause**: Using personal API key or browser login creates a personal worker, not a team pool.

**Solution**: Use a **service account API key** (Enterprise plan required) to register workers as part of a team-shared pool.

### Authentication Issues

1. Verify your API key or login credentials are valid
2. Check that your Cursor plan supports cloud agents
3. For OAuth flows, ensure your browser can complete the callback to the IDE

---

## References

| Resource | URL |
|----------|-----|
| Official Docs: Self-Hosted | https://cursor.com/docs/cloud-agent/self-hosted |
| Official Docs: Setup | https://cursor.com/docs/cloud-agent/setup |
| Official Docs: Kubernetes | https://cursor.com/docs/cloud-agent/self-hosted-k8s |
| Blog Announcement | https://cursor.com/blog/self-hosted-cloud-agents |
| Changelog (Mar 25, 2026) | https://cursor.com/changelog/03-25-26 |
| Dashboard | https://cursor.com/dashboard/cloud-agents |
| Onboarding | https://cursor.com/onboard |
| Contact Sales (Enterprise) | https://cursor.com/contact-sales?source=self-hosted-cloud-agents-blog |
| Community Forum | https://forum.cursor.com |
