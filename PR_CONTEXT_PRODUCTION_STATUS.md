# PR Context Production — Project Status Report

**Generated**: 2026-04-08  
**Project Location**: `/mlx_devbox/users/shuo.xin/playground/pr_context_production/`

---

## Executive Summary

The PR Context Production project is a large-scale data processing pipeline that transforms raw GitHub Pull Request data (~37 TB, 26 batches) into high-quality LLM training samples. The project has gone through **16 processing phases** (6→16 actively tracked), each refining the extraction, formatting, quality filtering, and deduplication of PR data. As of today, the project is in a **mature delivery state**: Phase 16 processing is complete, final datasets have been delivered (v3 with XML fix), and a Phase 16 plan for a next iteration exists but has not started execution.

---

## Phase History & Progression

| Phase | Key Change | Status |
|-------|-----------|--------|
| 6 | Initial production pipeline | Complete |
| 7 | Core formatting improvements | Complete |
| 8 | Meta struct fix, commit compression | Complete |
| 9–13 | Iterative refinements (10 through 13 rapid cycle) | Complete |
| 14 | Dedup, extended schema, new data sources, token-length split, LLM quality scoring | Complete |
| 15 | Diff-context extraction, higher token limits, record splitting | Complete (77/77 batches, 10.8 TB output) |
| 15b | Performance fix (persist → MEMORY_AND_DISK, removed redundant counts) | Complete |
| 16 | XML tag variety, format restructuring, dedup, threshold tuning | **Complete — all milestones M1–M6 done** |

---

## Current State: Phase 16

### What Phase 16 Changed
1. **XML tag variety**: 5+ alias names per tag type, randomly selected per record (deterministic hash on docid) to prevent pretrain overfitting
2. **Content restructuring**: PR description moved to end, redundant PATCH section removed, "before" file views merged into RELATED_FILES, changed-function extraction in COMMIT blocks
3. **Deduplication**: By repo_url + PR number (partition-level), plus SHA-256 content hash (global)
4. **Threshold tuning**: CR caps removed (uncapped files/comments, 15k char limit, 6k diff hunk limit), issues raised 3→5

### Phase 16 Milestones

| Milestone | Status |
|-----------|--------|
| M1: Data investigation & tag inventory | Complete |
| M2: Build `pr_processing_core_v16.py` | Complete |
| M3: Small-scale test | Complete |
| M4: Submit all production Spark jobs | Complete |
| M5: Monitor production jobs | Complete |
| M6: Statistics & record flow analysis | Complete |

### Processing Code Files
- `jobs/pr_processing_core_v16.py` (57 KB) — Core logic with tag aliases, new format, dedup, thresholds
- `jobs/spark_process_pr_v16.py` — Spark entry point
- `jobs/spark_process_pr_v16_chunked.py` — Chunked variant for large batches
- `jobs/spark_fix_xml_phase16.py` — Post-processing XML fix job
- `scripts/submit_phase16_all.sh` — Full production multi-batch submission
- `scripts/monitor_phase16_jobs.py` — YARN job monitoring with plots

---

## Bug: XML Tag Closure (Fixed)

**Severity**: Critical (100% of records affected)  
**Status**: Fixed and redelivered as v3  
**Root cause**: In `pr_processing_core_v16.py`, the `<CHANGED_FILES>` section opened `<FILE>` tags but never closed them — line 1200 was `parts.append('')` instead of the closing tag  
**Fix**: A post-processing Spark job (`spark_fix_xml_phase16.py`) inserted proper closing tags. The core module was also fixed for future runs.  
**Verification**: 99.9% of records now have balanced tags; remaining 0.1% are false positives from source code containing tag-like strings.

---

## Final Deliverables (v3 — Latest)

All datasets are SHA-256 deduplicated on `content_split`, token-filtered (30 < tc < 32760), tokenized with `bbpe155k-v6.4.3-ml.pret`.

### DS 2.2 — Compressed Commit

| Slice | Records | Tokens | Disk |
|-------|--------:|-------:|-----:|
| 128k–512k | 627,089 | 6.7B | 5.6 GB |
| 32k–128k | 1,448,297 | 17.4B | 17.7 GB |
| **Total** | **2,075,386** | **24.1B** | **23.3 GB** |

### DS 3 — PR Context (Phase 16, XML-fixed + SHA-256 deduped)

#### Masked

| Split | Records | Tokens | Selection |
|-------|--------:|-------:|-----------|
| progressive_all | 65,928,080 | 1,186.9B | all |
| progressive_mc | 31,413,847 | 609.8B | commit_count > 1 |
| conservative_all | 24,795,507 | 458.9B | llm_score > 60 |
| conservative_mc | 3,268,724 | 73.1B | qs > 0.7, llm > 60, cc > 1 |

#### Unmasked

| Split | Records | Tokens | Selection |
|-------|--------:|-------:|-----------|
| progressive_all | 65,097,927 | 1,186.1B | all |
| progressive_mc | 31,130,840 | 614.1B | commit_count > 1 |
| conservative_all | 24,579,630 | 462.5B | llm_score > 60 |
| conservative_mc | 3,182,410 | 72.3B | qs > 0.7, llm > 60, cc > 1 |

### DS 7.3 — Synthetic Trajectories (v3 fix)

| Variant | Records | Tokens | Disk |
|---------|--------:|-------:|-----:|
| Combined (action + CoT) | 41,392,496 | 498.3B | 433.6 GB |
| CoT only | 12,251,397 | 114.0B | 153.4 GB |

### DS 7.3 — NL2Repo

| Version | Stars | Records | Tokens | Disk |
|---------|------:|--------:|-------:|-----:|
| Phase 1 v1 | ≥ 5,000 | 743,145 | 4.1B | 4.9 GB |
| Phase 2 v1 | ≥ 1,000 | 1,507,176 | 8.1B | 9.6 GB |
| Phase 3 v1 | ≥ 10 | 5,745,038 | 27.3B | 30.1 GB |
| Phase 3 v4 | ≥ 0 | 14,619,070 | 34.2B | 43.9 GB |

### Grand Total

| Metric | Value |
|--------|------:|
| **Total records** | ~124M (inclusive largest variants) |
| **Total tokens** | ~1,746B (1.75 trillion) |
| **HDFS base** | `hdfs://haruna/home/byte_data_seed/hdd_hldy/user/shuo.xin/pr_context_data` |

---

## Side Projects

| Project | Location | Status |
|---------|----------|--------|
| Batch Inference / Synthesized Trajectories | `side_projects/batchinference_synthesize_data/` | Active — v3 fix deployed, 6 CoT batches consolidated |
| Compressed Commit Data | `side_projects/compress_commit_data/` | Complete |
| Detailed Statistics | `side_projects/detailed_stat/` | Complete (v1 + v2) |
| NL2Repo | `side_projects/nl2repo/` | Complete (p1-p3, v1-v4) |
| SWALM Synthesize Data | `side_projects/swalm_synthesize_data/` | Complete |
| Token Distribution Analysis | `side_projects/token_count_distribution_by_keys/` | Complete |
| Unique Repos | `side_projects/unique_repos/` | Complete |

---

## Active Processes

| Process | Status | Details |
|---------|--------|---------|
| PySpark Shell | Running | YARN cluster `bear-yg`, queue `root.seed_code_web`, 1000 executors × 64GB, started ~13:18 today |
| Jupyter Notebook | Running | Port 8891 |
| bg_monitor_ark.py | Running | Background monitoring |

---

## Project Statistics

| Metric | Value |
|--------|-------|
| Total phases | 16 (6–16 actively tracked) |
| Processing core versions | 12 (`pr_processing_core_v6.py` → `v16.py`) |
| Spark job scripts | 60+ submission scripts |
| Monitor scripts | 12 phase-specific monitors |
| Source data | ~37 TB across 26 batches (18 regular + 1 large 12.4 TB chunked into 25) |
| Git commits | 30+ (single `main` branch) |
| Documentation files | 25+ instruction/report markdown files |
| Asset directories | 20+ (plots, statistics, demos per phase) |
| Total output on HDFS | Multiple TB across all phases and deliveries |

---

## Pending / Next Steps

1. **Phase 16 milestones in `instructions_phase16.md` are marked "pending"** — but the actual execution has been completed based on the existence of v16 processing code, monitor output, statistics, and final deliveries. The instruction file status table was never updated to reflect completion.

2. **TODO file** lists some analysis tasks:
   - Score distribution analysis for below-threshold data
   - Correlation analysis with commit history length
   - These appear to be backlog items, not blockers

3. **No Phase 17 plan exists** — the project appears to be in a maintenance/delivery state.

4. **Potential follow-ups**:
   - The batch inference synthesized data side project (`instructions_v3.md`) had recent activity (Apr 6–8)
   - The PySpark shell currently running may be for ad-hoc analysis or a new processing run

---

## Repository Structure

```
pr_context_production/
├── README.md                           # Project overview
├── TODO                                # Backlog items
├── dirs.md                             # HDFS directory index
├── DATA_SPECIFICATION.md               # Schema docs (EN)
├── DATA_SPECIFICATION_CN.md            # Schema docs (CN)
├── REPORT_phase14.md                   # Phase 14 statistics report
├── instructions_phase{2-16}.md         # Phase plans (16 files)
├── instructions_phase15_investigation.md # Spark performance investigation
├── instructions_phase15_resubmitjobs.md
├── jobs/                               # Spark jobs & processing cores (75 files)
│   ├── pr_processing_core_v{6-16}.py   # 12 core module versions
│   ├── spark_process_pr_v{6-16}*.py    # Spark entry points
│   ├── compute_phase{14-16}_*.py       # Statistics/record-flow jobs
│   └── spark_fix_xml_*.py              # Bug fix jobs
├── scripts/                            # Submission, monitoring, plotting (95+ files)
│   ├── submit_phase{6-16}_*.sh         # Phase submission scripts
│   ├── monitor_phase{6-16}_jobs.py     # Job monitors
│   └── plot_phase{14-16}_statistics.py # Statistics plotters
├── final_deliver_pass/                 # Delivery reports (v1, v2, v2_corrected, v3_XMLfixed)
├── asset/                              # Phase-specific plots, statistics, demos (20+ dirs)
├── bug_report/                         # XML tag closure bug report + screenshots
├── side_projects/                      # 7 sub-projects (batch inference, NL2Repo, etc.)
├── analysis/                           # Analysis notebooks and scripts
├── research/                           # Development artifacts
├── knowledge/                          # Spark performance knowledge
├── docs/                               # Phase output examples (7-13)
├── conversation_database/              # Agent conversation logs
└── src/                                # Python processor class
```
