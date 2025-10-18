#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bookworm 项目代码审查生成器 v3 - 极度精简版（目标：<100k tokens）

策略：
- 只保留绝对核心的业务逻辑和架构
- 删除所有测试、文档、前端代码
- 压缩代码内容（去除多余空行和详细注释）
- 目标：30k词 ≈ 100k tokens

使用方法:
    python 审查v3.py

输出:
    bookworm_code_review_v3.txt
"""

import os
import datetime
import fnmatch
import re

# ==============================================================================
# 极度精简策略 - 只保留绝对核心
# ==============================================================================

# 核心文件（完整保留）
CORE_FILES = [
    'CLAUDE.md',  # AI操作手册（压缩版）
    'bookworm-backend/prisma/schema.prisma',  # 数据模型
    'bookworm-backend/src/config.ts',  # 系统配置（摘要）
    'bookworm-backend/src/errors.ts',  # 错误定义
    'bookworm-backend/src/db.ts',  # 数据库连接
    'bookworm-backend/src/app-factory.ts',  # 应用工厂
]

# 核心业务逻辑（只保留3个最核心的services和对应routes）
CORE_BUSINESS_FILES = [
    'bookworm-backend/src/services/inventoryService.ts',
    'bookworm-backend/src/services/orderService.ts',
    'bookworm-backend/src/services/authService.ts',
    'bookworm-backend/src/routes/inventory.ts',
    'bookworm-backend/src/routes/orders.ts',
    'bookworm-backend/src/routes/auth.ts',
]

# 关键适配器和工具（只保留最核心的）
CORE_ADAPTERS = [
    'bookworm-backend/src/adapters/wechatPayAdapter.ts',
    'bookworm-backend/src/utils/typeGuards.ts',
    'bookworm-backend/src/plugins/auth.ts',
]

ALL_CORE_FILES = CORE_FILES + CORE_BUSINESS_FILES + CORE_ADAPTERS

# ==============================================================================
# 内容压缩工具
# ==============================================================================

def compress_code(content, file_path):
    """
    压缩代码内容：
    - 删除多余空行（连续空行压缩为1行）
    - 删除单行注释（可选）
    - 保留核心逻辑和类型定义
    """
    # 对于CLAUDE.md，执行特殊压缩
    if file_path.endswith('CLAUDE.md'):
        return compress_claude_md(content)

    # 对于config.ts，只保留环境变量定义部分
    if file_path.endswith('config.ts'):
        return compress_config_ts(content)

    # 对于其他代码文件
    lines = content.split('\n')
    compressed = []
    prev_blank = False

    for line in lines:
        stripped = line.strip()

        # 跳过空行（但保留一个）
        if not stripped:
            if not prev_blank:
                compressed.append('')
                prev_blank = True
            continue

        prev_blank = False

        # 跳过单行注释（但保留JSDoc和重要注释）
        if stripped.startswith('//') and not stripped.startswith('// ===') and not stripped.startswith('// NOTE:') and not stripped.startswith('// IMPORTANT:'):
            continue

        compressed.append(line)

    return '\n'.join(compressed)

def compress_claude_md(content):
    """压缩CLAUDE.md：只保留核心原则和项目概述"""
    lines = content.split('\n')
    result = []
    keep_section = False

    # 定义要保留的章节
    keep_sections = [
        '# 角色定义',
        '## 我的核心哲学',
        '## 报告规则',
        '## 本项目核心法则',
        '## Project Overview',
        '## Architecture',
        '## Database Schema',
        '## Business Rules',
    ]

    # 定义要跳过的章节
    skip_sections = [
        '## Development Commands',
        '## Testing Strategy',
        '## Monitoring & Observability',
        '## Background Jobs',
        '## Deployment',
        '## Environment Configuration',
        '## API Endpoints',
        '## WeChat Integration',
        '## Important Development Notes',
    ]

    for line in lines:
        # 检查是否是标题
        if line.startswith('#'):
            # 检查是否是要保留的章节
            if any(line.startswith(section) for section in keep_sections):
                keep_section = True
                result.append(line)
            # 检查是否是要跳过的章节
            elif any(line.startswith(section) for section in skip_sections):
                keep_section = False
            else:
                # 其他章节根据当前状态决定
                if keep_section:
                    result.append(line)
        elif keep_section:
            result.append(line)

    return '\n'.join(result)

def compress_config_ts(content):
    """压缩config.ts：只保留环境变量列表和关键配置"""
    # 提取所有环境变量定义
    env_vars = re.findall(r'(\w+):\s*z\.(string|number|boolean)\(\)', content)

    result = [
        "// 系统配置（摘要版）",
        "// 完整环境变量列表：",
        ""
    ]

    for var_name, var_type in env_vars:
        result.append(f"// - {var_name}: {var_type}")

    result.extend([
        "",
        "// 关键配置结构：",
        "// - 服务器配置：PORT, HOST, NODE_ENV, LOG_LEVEL",
        "// - 数据库：DATABASE_URL（含连接池配置）",
        "// - JWT：JWT_SECRET, JWT_EXPIRES_IN",
        "// - 微信：WX_APP_ID, WX_APP_SECRET",
        "// - 微信支付：WXPAY_MCHID, WXPAY_PRIVATE_KEY_PATH, WXPAY_CERT_SERIAL_NO, WXPAY_API_V3_KEY",
        "// - 业务规则：ORDER_PAYMENT_TTL_MINUTES, MAX_ITEMS_PER_ORDER, MAX_RESERVED_ITEMS_PER_USER",
        "// - 事务重试：DB_TRANSACTION_RETRY_COUNT, DB_TRANSACTION_RETRY_BASE_DELAY_MS",
        "// - 安全：PAYMENT_TIMESTAMP_TOLERANCE_SECONDS",
        "// - 限流：API_RATE_LIMIT_MAX, API_RATE_LIMIT_WINDOW_MINUTES",
        "// - 定时任务：CRON_ORDER_CLEANUP, CRON_INVENTORY_METRICS, CRON_REFUND_PROCESSOR",
    ])

    return '\n'.join(result)

# ==============================================================================
# 核心逻辑
# ==============================================================================

def should_include_file(rel_path):
    """判断文件是否应该包含（严格白名单）"""
    return rel_path in ALL_CORE_FILES

def collect_core_files(project_root):
    """收集核心文件"""
    found_files = []

    for core_file in ALL_CORE_FILES:
        full_path = os.path.join(project_root, core_file)
        if os.path.exists(full_path) and os.path.isfile(full_path):
            found_files.append(core_file)

    return sorted(found_files)

def read_file_content(file_path):
    """尝试多种编码读取文件"""
    encodings = ['utf-8', 'gbk', 'latin-1']
    for encoding in encodings:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                return f.read()
        except Exception:
            continue
    return f"[Error: Unable to decode file '{os.path.basename(file_path)}']"

def generate_review_file_v3(project_root):
    """生成v3版本的极度精简审查报告"""
    output_filename = 'bookworm_code_review_v3.txt'
    output_filepath = os.path.join(project_root, output_filename)

    # 收集文件
    core_files = collect_core_files(project_root)

    with open(output_filepath, 'w', encoding='utf-8') as f:
        # 头部信息
        f.write("=" * 80 + "\n")
        f.write("BOOKWORM PROJECT - CODE REVIEW v3 (ULTRA-COMPRESSED)\n")
        f.write("=" * 80 + "\n")
        f.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Strategy: Absolute core only (<100k tokens target)\n")
        f.write(f"Philosophy: Maximum information density, zero noise\n\n")

        # 统计信息
        f.write("### 📊 COMPRESSION STATISTICS ###\n")
        f.write("-" * 80 + "\n")
        f.write(f"Total files included:  {len(core_files)} files (v2: 92 files, 60% reduction)\n")
        f.write(f"Target token count:    <100k tokens\n")
        f.write(f"Compression methods:   Remove tests, docs, frontend, comments, empty lines\n\n")

        f.write("### 🎯 INCLUDED COMPONENTS ###\n")
        f.write("-" * 80 + "\n")
        f.write("✓ AI operating manual (CLAUDE.md - compressed)\n")
        f.write("✓ Database schema (schema.prisma - complete)\n")
        f.write("✓ Core services (3): inventory, order, auth\n")
        f.write("✓ Core routes (3): corresponding to services\n")
        f.write("✓ Critical adapters: WeChat Pay\n")
        f.write("✓ Application factory and DB connection\n\n")

        f.write("### 🗑️ EXCLUDED COMPONENTS ###\n")
        f.write("-" * 80 + "\n")
        f.write("✗ All tests and test infrastructure\n")
        f.write("✗ All documentation (README, guides, etc.)\n")
        f.write("✗ All frontend code (WeChat Mini Program)\n")
        f.write("✗ Non-core services (book, content, acquisition, refund)\n")
        f.write("✗ All plugins except auth\n")
        f.write("✗ All background jobs\n")
        f.write("✗ Most utility functions\n")
        f.write("✗ Deployment configs, migrations, build files\n\n")

        # 文件列表
        f.write("### 📋 CORE FILES LIST ###\n")
        f.write("-" * 80 + "\n")
        for i, rel_path in enumerate(core_files, 1):
            f.write(f"{i:2d}. {rel_path}\n")
        f.write("\n\n")

        # 源代码内容（压缩版）
        f.write("### 📄 SOURCE CODE (COMPRESSED) ###\n")
        f.write("-" * 80 + "\n\n")

        for rel_path in core_files:
            full_path = os.path.join(project_root, rel_path)
            f.write("=" * 80 + f"\n### FILE: {rel_path}\n" + "=" * 80 + "\n\n")

            if os.path.exists(full_path) and os.path.isfile(full_path):
                content = read_file_content(full_path)
                compressed_content = compress_code(content, rel_path)
                f.write(compressed_content.strip() + "\n\n\n")
            else:
                f.write(f"[FILE NOT FOUND]\n\n\n")

        # 尾部
        f.write("=" * 80 + "\n")
        f.write("CODE REVIEW v3 GENERATION COMPLETE\n")
        f.write("=" * 80 + "\n")
        f.write("\nUltra-compressed for external AI consumption (<100k tokens).\n")

    return output_filepath, len(core_files)

def main():
    project_root = os.getcwd()
    print("=" * 80)
    print("BOOKWORM CODE REVIEW v3 - ULTRA-COMPRESSED EDITION")
    print("=" * 80)
    print("\n[START] Generating ultra-compressed code review (<100k tokens)...\n")

    try:
        output_file, total_files = generate_review_file_v3(project_root)
        file_size = os.path.getsize(output_file)
        size_str = f"{file_size / 1024:.1f} KB" if file_size > 1024 else f"{file_size} bytes"

        # 估算token数（假设1KB ≈ 250-300 tokens）
        estimated_tokens = int(file_size / 1024 * 270)

        print("[SUCCESS] Ultra-compressed review generated!")
        print("-" * 80)
        print(f"Output file:      {os.path.basename(output_file)}")
        print(f"File size:        {size_str}")
        print(f"Estimated tokens: ~{estimated_tokens:,} tokens")
        print(f"Total files:      {total_files} (v2: 92, reduced by {92-total_files})")
        print(f"Compression:      {(1 - total_files/92)*100:.1f}% fewer files")
        print("-" * 80)

        # 检查是否达到目标
        if estimated_tokens <= 100000:
            print("\n[OK] TARGET ACHIEVED: <100k tokens")
        else:
            print(f"\n[WARN] OVER TARGET: {estimated_tokens - 100000:,} tokens over 100k limit")
            print("       Consider further reduction if needed.")

        print("\n[INFO] What was removed:")
        print("  - All 20 P2 files (tests and documentation)")
        print("  - All 31 P1 files (frontend, plugins, jobs)")
        print("  - 28 P0 files (non-core services, routes, utils)")
        print("  - Code comments and empty lines compressed")

        print("\n[INFO] What remains:")
        print("  + CLAUDE.md (core principles only)")
        print("  + schema.prisma (complete data model)")
        print("  + 3 core services (inventory, order, auth)")
        print("  + 3 core routes (corresponding to services)")
        print("  + WeChat Pay adapter (critical integration)")
        print("  + App factory and DB connection")

        print("\n" + "=" * 80)
        print("READY FOR EXTERNAL AI - MAXIMUM DENSITY, ZERO NOISE")
        print("=" * 80)

    except Exception as e:
        print(f"\n[ERROR] Failed to generate report: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
