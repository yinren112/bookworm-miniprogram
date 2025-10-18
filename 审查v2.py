#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bookworm 项目代码审查生成器 v2 - Linus式重构版
基于优先级分层的白名单策略，最大化信噪比。

哲学：
- Good Taste: 简单的数据结构 → 简单的代码
- 白名单策略：明确知道要什么，而不是猜测要排除什么
- 分层优先级：P0(核心) > P1(重要) > P2(文档) > GARBAGE(垃圾)

使用方法:
    python 审查v2.py

输出:
    bookworm_code_review_v2.txt
"""

import os
import datetime
import fnmatch

# ==============================================================================
# 优先级分层 - 数据结构即法律
# ==============================================================================

# === P0: 绝对核心（必须包含）- 业务逻辑和架构基石 ===
P0_CRITICAL_FILES = [
    'CLAUDE.md',  # AI操作手册
    'bookworm-backend/prisma/schema.prisma',  # 数据真相
    'bookworm-backend/src/config.ts',  # 系统配置
    'bookworm-backend/src/errors.ts',  # 错误定义
    'bookworm-backend/src/db.ts',  # 数据库连接
    'bookworm-backend/src/index.ts',  # 应用入口
    'bookworm-backend/src/app-factory.ts',  # 应用工厂
    'bookworm-backend/src/constants.ts',  # 业务常量
]

P0_CRITICAL_PATTERNS = [
    'bookworm-backend/src/services/*.ts',  # 业务逻辑核心
    'bookworm-backend/src/routes/*.ts',  # API路由定义
    'bookworm-backend/src/adapters/*.ts',  # 外部集成适配器
    'bookworm-backend/src/utils/*.ts',  # 工具函数
]

# === P1: 重要上下文（强烈建议包含）- 理解系统运行机制 ===
P1_IMPORTANT_PATTERNS = [
    'bookworm-backend/src/plugins/*.ts',  # Fastify插件
    'bookworm-backend/src/jobs/*.ts',  # 定时任务
    'bookworm-backend/src/types/*.ts',  # 类型定义
    'miniprogram/app.js',  # 小程序入口
    'miniprogram/app.json',  # 小程序配置
    'miniprogram/config.js',  # 前端配置
    'miniprogram/pages/*/index.js',  # 页面逻辑
    'miniprogram/utils/*.js',  # 前端工具函数
    'miniprogram/components/*/*.js',  # 组件
]

P1_IMPORTANT_FILES = [
    'bookworm-backend/package.json',  # 依赖关系（注意不是lock文件）
    'bookworm-backend/eslint.config.js',  # 代码规范
    'bookworm-backend/tsconfig.json',  # TypeScript配置
    'miniprogram/app.json',  # 小程序配置
]

# === P2: 补充文档（可选但有价值）- 提供高层视角和示例 ===
P2_DOCUMENTATION = [
    'README.md',
    'AGENTS.md',
    'RECOMMENDATION_SETUP.md',
    'bookworm-backend/README.md',
    'bookworm-backend/RECOMMENDATIONS_API.md',
    # 精选的集成测试 - 作为API行为的可执行文档
    'bookworm-backend/src/tests/order.integration.test.ts',
    'bookworm-backend/src/tests/concurrent-order-control.integration.test.ts',
    'bookworm-backend/src/tests/paymentSecurity.integration.test.ts',
    'bookworm-backend/src/tests/user-merge.integration.test.ts',
    'bookworm-backend/src/tests/sell-orders.integration.test.ts',
    # 测试基础设施 - 理解测试如何运行
    'bookworm-backend/src/tests/globalSetup.ts',
    'bookworm-backend/src/tests/integrationSetup.ts',
    'bookworm-backend/src/tests/database-integration-setup.ts',
    # 测试工具
    'bookworm-backend/src/tests/test-helpers/*.ts',
    # Claude Code自定义命令
    '.claude/commands/**/*.md',
    '.claude/settings.local.json',
]

# === GARBAGE: 绝对排除 - 噪音和自动生成内容 ===
ABSOLUTE_GARBAGE = [
    # 锁文件（自动生成，零业务价值）
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',

    # 数据库迁移历史（有schema.prisma就够了）
    '**/migrations/**/*.sql',
    '**/migrations/**/migration.sql',
    'bookworm-backend/prisma/migrations/**',

    # 运维和测试工具（不是核心代码）
    '**/load-test*.js',
    '**/load-test*.ts',
    'fix_*.py',
    'update_*.js',
    'seed-*.sql',
    'upgrade-*.ts',
    'upgrade-*.sql',
    '**/generate-load*.js',
    '**/generate-load*.ts',

    # 脚本自身
    '审查*.py',

    # 本地配置和私有文件
    '**/project.private.config.json',
    '**/.env.local',
    '**/.env.*.local',

    # 部署配置（除非需要理解基础设施）
    'docker-compose*.yml',
    '**/Dockerfile*',
    '**/nginx*.conf',
    'prometheus.yml',

    # 前端UI文件（只关注逻辑）
    '**/*.wxml',
    '**/*.wxss',
    '**/*.css',
    '**/*.html',
    'miniprogram/images/**',
    'miniprogram/sitemap.json',
    'project.config.json',

    # 构建产物和缓存
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.nyc_output/**',
    '**/miniprogram_npm/**',

    # IDE和版本控制
    '**/.git/**',
    '**/.vscode/**',
    '**/.idea/**',
    '**/__pycache__/**',
    '**/.DS_Store',

    # 单元测试（太多细节，我们只要集成测试示例）
    'bookworm-backend/src/tests/*.test.ts',  # 但P2会白名单一些
    'bookworm-backend/src/tests/__mocks__/**',
    'bookworm-backend/vitest*.config.ts',
]

# ==============================================================================
# 核心逻辑 - 简洁的分层判断
# ==============================================================================

def matches_any_pattern(file_path, patterns):
    """检查文件路径是否匹配任何glob模式"""
    for pattern in patterns:
        if fnmatch.fnmatch(file_path, pattern):
            return True
    return False

def get_file_priority(rel_path):
    """
    返回文件优先级: 'P0', 'P1', 'P2', 'GARBAGE', None
    Linus式设计：消除复杂的if/else嵌套，用清晰的层次结构

    关键：白名单优先于黑名单，允许精选的测试文件覆盖通用排除规则
    """
    # 第一层：P0核心文件（最高优先级，不可被覆盖）
    if rel_path in P0_CRITICAL_FILES:
        return 'P0'
    if matches_any_pattern(rel_path, P0_CRITICAL_PATTERNS):
        return 'P0'

    # 第二层：P1重要文件
    if rel_path in P1_IMPORTANT_FILES:
        return 'P1'
    if matches_any_pattern(rel_path, P1_IMPORTANT_PATTERNS):
        return 'P1'

    # 第三层：P2文档（包括精选的集成测试，白名单覆盖黑名单）
    if matches_any_pattern(rel_path, P2_DOCUMENTATION):
        return 'P2'

    # 第四层：绝对垃圾，拒绝
    if matches_any_pattern(rel_path, ABSOLUTE_GARBAGE):
        return 'GARBAGE'

    # 第五层：不在任何白名单中，拒绝（白名单策略）
    return None

def should_include_dir(dir_name):
    """快速过滤目录，避免深入垃圾目录"""
    garbage_dirs = {
        'node_modules', '.git', 'dist', 'build', 'coverage',
        '.nyc_output', 'miniprogram_npm', '.vscode', '.idea',
        '__pycache__', 'migrations'  # 明确排除migrations
    }
    return dir_name not in garbage_dirs

def collect_files_by_priority(project_root):
    """收集所有文件并按优先级分类"""
    files_by_priority = {'P0': [], 'P1': [], 'P2': []}

    for root, dirs, files in os.walk(project_root):
        # 过滤目录，避免进入垃圾目录
        dirs[:] = [d for d in dirs if should_include_dir(d)]

        for file in files:
            file_path = os.path.join(root, file)

            # Windows兼容性：跳过特殊设备和无法处理的路径
            try:
                rel_path = os.path.relpath(file_path, project_root).replace(os.sep, '/')
            except (ValueError, OSError):
                # 跳过特殊设备文件（如Windows的nul）和无效路径
                continue

            priority = get_file_priority(rel_path)
            if priority in files_by_priority:
                files_by_priority[priority].append(rel_path)

    # 排序以便输出稳定
    for priority in files_by_priority:
        files_by_priority[priority].sort()

    return files_by_priority

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

def generate_review_file_v2(project_root):
    """生成v2版本的审查报告"""
    output_filename = 'bookworm_code_review_v2.txt'
    output_filepath = os.path.join(project_root, output_filename)

    # 收集文件并分类
    files_by_priority = collect_files_by_priority(project_root)
    total_files = sum(len(files) for files in files_by_priority.values())

    with open(output_filepath, 'w', encoding='utf-8') as f:
        # 头部信息
        f.write("=" * 80 + "\n")
        f.write("BOOKWORM PROJECT - CODE REVIEW v2 (HIGH SIGNAL-TO-NOISE RATIO)\n")
        f.write("=" * 80 + "\n")
        f.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Strategy: Priority-based whitelist (P0 > P1 > P2)\n")
        f.write(f"Philosophy: Good Taste - Simple data structures lead to simple code\n\n")

        # 统计信息
        f.write("### 📊 FILE STATISTICS BY PRIORITY ###\n")
        f.write("-" * 80 + "\n")
        f.write(f"P0 (Critical - Core Business Logic):     {len(files_by_priority['P0']):3d} files\n")
        f.write(f"P1 (Important - System Context):         {len(files_by_priority['P1']):3d} files\n")
        f.write(f"P2 (Documentation - Examples & Tests):   {len(files_by_priority['P2']):3d} files\n")
        f.write(f"{'-' * 80}\n")
        f.write(f"Total files included:                     {total_files:3d} files\n\n")

        f.write("### 🎯 DESIGN PRINCIPLES ###\n")
        f.write("-" * 80 + "\n")
        f.write("✓ Whitelist strategy: Explicitly include what matters\n")
        f.write("✓ Zero noise: No package-lock.json, no migrations, no build artifacts\n")
        f.write("✓ Integration tests included: Executable documentation of API behavior\n")
        f.write("✓ Priority-based: P0 (services/routes) → P1 (plugins/jobs) → P2 (docs/tests)\n\n")

        # 文件列表（按优先级分组）
        f.write("### 📋 INCLUDED FILES BY PRIORITY ###\n")
        f.write("-" * 80 + "\n")

        for priority in ['P0', 'P1', 'P2']:
            f.write(f"\n## {priority} Files ({len(files_by_priority[priority])}):\n")
            for rel_path in files_by_priority[priority]:
                f.write(f"  - {rel_path}\n")

        f.write("\n\n")

        # 源代码内容（按优先级顺序输出）
        f.write("### 📄 SOURCE CODE CONTENT ###\n")
        f.write("-" * 80 + "\n\n")

        for priority in ['P0', 'P1', 'P2']:
            if files_by_priority[priority]:
                f.write("=" * 80 + "\n")
                f.write(f"### {priority} PRIORITY FILES ###\n")
                f.write("=" * 80 + "\n\n")

                for rel_path in files_by_priority[priority]:
                    full_path = os.path.join(project_root, rel_path)
                    f.write("-" * 80 + f"\n### FILE: {rel_path}\n" + "-" * 80 + "\n\n")

                    if os.path.exists(full_path) and os.path.isfile(full_path):
                        content = read_file_content(full_path)
                        f.write(content.strip() + "\n\n\n")
                    else:
                        f.write(f"[FILE NOT FOUND]\n\n\n")

        # 尾部
        f.write("=" * 80 + "\n")
        f.write("CODE REVIEW v2 GENERATION COMPLETE\n")
        f.write("=" * 80 + "\n")
        f.write("\nDesigned with 'Good Taste' - Linus Torvalds would approve.\n")

    return output_filepath, files_by_priority

def main():
    project_root = os.getcwd()
    print("=" * 80)
    print("BOOKWORM CODE REVIEW v2 - LINUS EDITION")
    print("=" * 80)
    print("\n[START] Generating high signal-to-noise ratio code review...\n")

    try:
        output_file, files_by_priority = generate_review_file_v2(project_root)
        file_size = os.path.getsize(output_file)
        size_str = f"{file_size / 1024:.1f} KB" if file_size > 1024 else f"{file_size} bytes"
        total_files = sum(len(files) for files in files_by_priority.values())

        print("[SUCCESS] Review generation successful!")
        print("-" * 80)
        print(f"Output file:    {os.path.basename(output_file)}")
        print(f"File size:      {size_str}")
        print(f"Total files:    {total_files}")
        print(f"  - P0 (Core):  {len(files_by_priority['P0'])} files")
        print(f"  - P1 (Ctx):   {len(files_by_priority['P1'])} files")
        print(f"  - P2 (Docs):  {len(files_by_priority['P2'])} files")
        print("-" * 80)
        print("\n[INFO] Excluded noise:")
        print("  - package-lock.json (auto-generated)")
        print("  - All database migrations (schema.prisma is enough)")
        print("  - Load test scripts (not core business logic)")
        print("  - One-time fix scripts (not architecture)")
        print("  - UI template files (.wxml/.wxss)")
        print("\n[INFO] Included value:")
        print("  + All services and routes (core business logic)")
        print("  + 5 key integration tests (executable API documentation)")
        print("  + Test infrastructure (understand how tests work)")
        print("  + Adapters and plugins (system architecture)")
        print("\n" + "=" * 80)
        print("REPORT READY FOR HIGH-LEVEL AI CONSUMPTION")
        print("=" * 80)

    except Exception as e:
        print(f"\n[ERROR] Failed to generate report: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
