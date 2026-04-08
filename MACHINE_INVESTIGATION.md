# Machine Deep Investigation Report

**Generated**: 2026-04-08  
**Hostname**: `mlxlabj7hbvi4z68fff83b-20251027225451-tv7jsm-master`  
**Owner**: `shuo.xin`

---

## 1. Infrastructure Overview

This machine is a **Kubernetes pod** running inside a ByteDance internal MLX (Machine Learning eXperience) DevBox platform.

| Property | Value |
|---|---|
| Platform | ByteDance MLX DevBox (Arnold Workspace) |
| Workspace ID | 88435 |
| Workspace Name | `mlxlabj7hbvi4z68fff83b-20251027225451-tv7jsm` |
| Cluster | `candy-lq` |
| K8s Namespace | `workspace` |
| K8s QoS | Burstable |
| Pod ID | `33acd88d-7f31-4a8c-b772-1ddaa2f0ec97` |
| Container ID | `75be6a3a8109...c2f1df41` |
| Region | CN (China) |
| IP Type | IPv6 preferred |
| IPv6 Address | `fdbd:dc03:c:481:2428:159:7300:50` |

---

## 2. Hardware & Resources

### 2.1 CPU

| Property | Value |
|---|---|
| Model | Intel Xeon Platinum 8336C @ 2.30 GHz (Ice Lake) |
| Physical Cores | 32 (host has 64 HT siblings) |
| Cache | 55296 KB (L3) |
| Key Features | AVX-512 (F, DQ, BW, VL, VBMI, VNNI, BITALG, VPOPCNTDQ), VMX, AES-NI, SHA-NI |
| Cgroup CPU Quota | 800000 / 100000 = **8 vCPUs** allocated |

### 2.2 Memory

| Property | Value |
|---|---|
| Cgroup Memory Limit | **16 GB** (17,179,869,184 bytes) |
| Current Usage | ~8.5 GB (9,122,107,392 bytes) |
| Shared Memory (/dev/shm) | 9.6 GB |

### 2.3 GPU

| Property | Value |
|---|---|
| GPU Hardware | **None attached** (no nvidia-smi, no `/proc/driver/nvidia`) |
| CUDA Toolkit | 12.2 (V12.2.140) installed but no physical GPU |
| cuDNN | 8.x (shared libraries present) |
| PyTorch CUDA | `torch.cuda.is_available() = False` |

### 2.4 Storage

| Mount | Type | Size | Used | Avail | Purpose |
|---|---|---|---|---|---|
| `/` (vdi) | ext4 | 125G | 84G | 42G | Root filesystem (remote rootfs) |
| `/tmp` (nvme0n1p3) | ext4 | 1.7T | 855G | 711G | Local NVMe temp storage |
| `/usr/local/bvc` (nvme0n1p2) | ext4 | 110G | 35G | 69G | BVC store (read-only) |

**Block Devices**: Multiple virtual disks (vda-vdam, 128G-249G each), 2x NVMe SSDs (1.7TB each), 2x NBD devices (128G each).

---

## 3. Operating System

| Property | Value |
|---|---|
| OS | Debian GNU/Linux 11 (Bullseye) |
| Kernel | 5.4.143.bsk.8-amd64 (custom ByteDance kernel) |
| Architecture | x86_64 |
| glibc | 2.31-13+deb11u8 |
| Init System | Running inside container (PID 1 is a Python JupyterLab process) |

---

## 4. Installed Software

### 4.1 Programming Languages & Runtimes

| Language | Version | Path |
|---|---|---|
| Python | 3.9.2 | `/usr/bin/python3` |
| Node.js | 24.13.0 | `/home/tiger/.nvm/versions/node/v24.13.0/bin/node` |
| npm | (bundled with Node) | via nvm |
| Java | 1.8.0_91 (Oracle HotSpot) | `/opt/tiger/yarn_deploy/jdk/bin/java` |
| Perl | 5.32.1 | system |
| GCC/G++ | 10.2.1 | system |
| CMake | 3.18.4 | system |
| Make | 4.3 | system |

**Not installed**: Rust, Go, Ruby, ripgrep (`rg`), GitHub CLI (`gh`)

### 4.2 JDK Versions Available (under `/opt/tiger/jdk/`)

- JDK 8 (multiple builds: 8u60, 8u91, 8u131, 8u265, 8u352)
- JDK 9 (OpenJDK 9.0.1)
- JDK 11 (ByteOpenJDK 11.0.19)
- JDK 17 (ByteOpenJDK 17.0.9)

### 4.3 Python Packages (330 total)

Key packages and their versions:

| Category | Packages |
|---|---|
| **ML/DL** | PyTorch 2.1.0, torchvision 0.16.0+cu121, torchaudio 2.1.0+cu121, transformers 4.38.2, tokenizers 0.15.2, safetensors 0.7.0, triton 2.1.0, warp-lang 1.10.1, scikit-learn 1.6.1 |
| **Data** | numpy 1.26.4, pandas 2.3.3, pyarrow 21.0.0, scipy 1.13.1, datasets 4.4.1 |
| **Distributed** | Ray 2.51.1 (bytedray 2.10.0.39), PySpark 3.2.1, findspark 2.0.1 |
| **Viz** | matplotlib 3.9.4, seaborn 0.13.2, pillow 11.0.0 |
| **Web/API** | FastAPI 0.102.0, uvicorn 0.29.0, httpx 0.23.3, requests 2.32.3, aiohttp 3.8.6 |
| **Jupyter** | jupyterlab 3.6.8, notebook 6.5.7, ipykernel 6.29.5, ipywidgets 8.1.7, papermill 2.6.0 |
| **LLM** | openai 2.16.0, tiktoken 0.12.0, huggingface-hub 0.36.0, hf_transfer 0.1.9 |
| **ByteDance Internal** | byted-torch 2.1.0.post12, byted-wandb 0.13.92, bytedray, bytedtos, bytedlogger, byted_arktos, byted_mario_collector, mlx-python-sdk 0.3.0, volcengine 1.0.215 |
| **Profiling** | memray 1.19.1, py-spy 0.4.1, gpustat 1.0.0, psutil 7.0.0 |

### 4.4 Other Tools

| Tool | Version/Status |
|---|---|
| Docker | 20.10.5+dfsg1 (client only; daemon not running) |
| tmux | installed (`/usr/bin/tmux`) |
| git | installed |
| curl | installed |
| pip3 | 25.3 |
| virtualenv | 20.35.4 |

---

## 5. Big Data Stack

This machine has a full Hadoop/Spark/Hive ecosystem pre-deployed:

| Component | Location |
|---|---|
| Spark | `/opt/tiger/spark_deploy/` (versions: 3.0, 3.2, stable, dev, test, tea) |
| Hadoop/YARN | `/opt/tiger/yarn_deploy/` (CDH 5.4.4 based) |
| Hive | `/opt/tiger/hive_deploy/` (CDH 5.5.1, extensive conf variants) |
| Consul | `/opt/tiger/consul_deploy/` |
| HDFS Client | `/opt/tiger/hdfs_client/`, `/opt/tiger/arnold/hdfs_client/` |

**Active Spark Job**: A PySpark shell is running with:
- Master: YARN
- Queue: `root.seed_code_web`
- Cluster: `bear-yg`
- Executor memory: 64 GB × 1000 instances
- Driver memory: 4 GB
- Docker executor image: `hub.byted.org/dorado/nlp_pyspark:8a264e225684...`

---

## 6. Running Services & Processes

### 6.1 Key Running Processes

| Process | Memory (RSS) | Description |
|---|---|---|
| Cursor Server (node) | ~2.8 GB | Remote Cursor IDE server |
| PySpark Driver (java) | ~1.2 GB | Active Spark job on YARN |
| Cursor Extension Host | ~866 MB | VS Code extension host |
| Cursor Pyright | ~605 MB | Python language server |
| Cursor Cloud Agents | ~170-190 MB each | 4 agent worker processes |
| Jupyter Notebook | ~131 MB | Running on port 8891 |
| JupyterLab (root) | ~84 MB | Running on port (PID 29, started Feb 24) |
| IPython Kernel | ~79 MB | Active notebook kernel |
| CloudIDE (code-server) | ~76 MB | Running on port 8080 |
| MLX Agent (Go binary) | ~66 MB | Platform management agent |
| Seed Proxy | ~24 MB | Internal proxy service |
| bg_monitor_ark.py | ~33 MB | Background monitoring script |

### 6.2 Jupyter Servers

- **Notebook**: `http://0.0.0.0:8891` (user-started, no auth)
- **JupyterLab**: root-level (started at container init)
- **Kernels**: `python3`, `merlin_kernel`

---

## 7. Network Configuration

| Property | Value |
|---|---|
| IPv6 Address | `fdbd:dc03:c:481:2428:159:7300:50` |
| DNS | Managed via container `/etc/resolv.conf` |
| HTTP Proxy | `http://sys-proxy-rd-relay.byted.org:3128` |
| HTTPS Proxy | `http://sys-proxy-rd-relay.byted.org:3128` |

### Connectivity Test Results

| Endpoint | Status | Latency |
|---|---|---|
| github.com | 200 OK | 0.83s |
| pypi.org | 200 OK | 0.51s |
| npmjs.com | 403 Forbidden | 0.73s |
| huggingface.co | 200 OK | 0.67s |

> Note: npmjs.com returns 403 (likely proxy/firewall restriction).

---

## 8. Filesystem Layout

```
/
├── home/tiger/              # User home directory
│   ├── .cursor-server/      # Cursor remote server
│   ├── .nvm/                # Node version manager
│   ├── .local/              # User-local binaries (pip, cursor-agent)
│   ├── .cache/              # Cache directory
│   └── system_op/           # System operation tools
├── mlx_devbox/              # MLX DevBox mount
│   ├── users/shuo.xin/
│   │   ├── config/          # User configuration
│   │   ├── playground/      # Main workspace (many projects)
│   │   │   └── io-page-zip/ # ** THIS REPOSITORY **
│   │   └── repo/            # User repos
│   └── workspace/           # Shared workspace
├── opt/tiger/               # Platform deployments
│   ├── spark_deploy/        # Apache Spark
│   ├── yarn_deploy/         # Hadoop YARN + HDFS
│   ├── hive_deploy/         # Apache Hive
│   ├── jdk/                 # Multiple JDK versions
│   ├── consul_deploy/       # Consul service discovery
│   ├── hdfs_client/         # HDFS client libraries
│   └── mlx_deploy/          # MLX platform components
├── workspace/               # Container workspace utilities
│   ├── seedproxy/           # Seed proxy service
│   ├── jupyter/             # Jupyter configuration
│   └── vscode/              # VS Code server config
└── tmp/                     # 1.7TB NVMe-backed temp storage
```

---

## 9. Resource Limits (Cgroup)

| Resource | Limit | Current Usage |
|---|---|---|
| CPU | 8 vCPUs (800000/100000 quota) | Variable |
| Memory | 16 GB | ~8.5 GB |
| Open Files | 1,024,768 | - |
| Max Processes | unlimited | - |
| Stack Size | 8 MB | - |

---

## 10. Environment Summary

### What This Machine Is

A **ByteDance MLX DevBox** — an internal ML development environment running as a Kubernetes pod on the `candy-lq` cluster. It provides:

1. **IDE access** via Cursor (remote server), CloudIDE (code-server on port 8080), and JupyterLab
2. **Big data stack** with pre-deployed Spark 3.2, Hadoop YARN, and Hive connected to the `bear-yg` YARN cluster
3. **ML framework stack** with PyTorch 2.1.0, Ray 2.51.1, HuggingFace Transformers, and various ByteDance-internal ML libraries
4. **CUDA toolkit** 12.2 installed but no physical GPU attached (CPU-only node)
5. **1.7TB local NVMe** storage for temporary data
6. **External connectivity** through corporate proxy to GitHub, PyPI, HuggingFace

### What's Running Right Now

- A **PySpark shell** connected to YARN cluster `bear-yg` with up to 1000 executors (64GB each, queue `root.seed_code_web`)
- **Cursor remote server** with 4 cloud agent workers
- **Jupyter Notebook** on port 8891
- **Background monitoring** script (`bg_monitor_ark.py`)

### Missing Tools (for Cursor Cloud Agent use)

- `gh` (GitHub CLI) — not installed
- `rg` (ripgrep) — not installed
- Rust, Go, Ruby — not installed
- Docker daemon — not running (client-only)
