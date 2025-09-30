#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bookworm 项目代码审查文件生成器 (原始版 - 不脱敏)
基于文件扩展名和路径模式智能包含所有核心业务代码，保持原始数据不脱敏。

使用方法:
1. 将此脚本保存为 `审查.py` 放在项目根目录。
2. 在终端中运行: `python3 审查.py`

输出:
    bookworm_code_review.txt
"""

import os
import datetime
import fnmatch

# ==============================================================================
# 智能文件包含规则 (v4 - 健壮版)
# 哲学: 广泛包含所有潜在的源代码和配置文件，然后精确排除已知的噪音。
# 这比维护一个脆弱的"必要文件"白名单要健壮得多。
# ==============================================================================

# 1. 定义什么是源代码/配置文件 (通过扩展名)
#    这些是我们关心的东西。
SOURCE_CODE_EXTENSIONS = {
    '.ts', '.js', '.prisma', '.md', '.sql',  # Code & Schema
    '.json', '.env', '.toml', '.yml', '.yaml', # Configs
    '.py' # Include the script itself for context
}

# 2. 定义什么是绝对的噪音 (通过路径和文件名模式)
#    这些东西永远不应该出现在审查报告里。
EXCLUDE_PATTERNS = [
    # 目录
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.nyc_output/**',
    '**/miniprogram_npm/**',
    '**/.vscode/**',
    '**/.idea/**',
    '**/__pycache__/**',

    # 锁文件和私有配置
    '**/package-lock.json',
    '**/yarn.lock',
    '**/project.private.config.json',

    # 编译输出或缓存
    '**/*.log',
    '**/*.tmp',
    '**/*.cache',
    '**/.DS_Store',

    # 明确不关心的前端资源和配置文件
    'miniprogram/images/**',
    'miniprogram/**/*.wxml',
    'miniprogram/**/*.wxss',
    'miniprogram/sitemap.json',
    'project.config.json',
    '.eslintrc.js',
    'bookworm-backend/public/**',

    # 我们只关心集成测试，单元测试噪音太大
    'bookworm-backend/src/tests/*.test.ts',
    'bookworm-backend/src/tests/__mocks__/**',
    'bookworm-backend/vitest.config.ts',
    'bookworm-backend/vitest.integration.config.ts',
    'bookworm-backend/vitest.database-integration.config.ts'
]

# 3. 定义敏感文件 (内容需要脱敏)
#    这个版本我们先不脱敏，但保留列表以便切换。
SENSITIVE_FILES = {
    # 'bookworm-backend/.env' # 暂时注释掉，以便你看到完整内容
}

def should_include_dir(dir_path):
    """A robust check to prevent descending into known garbage directories."""
    dir_name = os.path.basename(dir_path)
    # These are the top-level directories we ALWAYS want to skip.
    garbage_dirs = {'node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output', 'miniprogram_npm', '.vscode', '.idea', '__pycache__'}
    if dir_name in garbage_dirs:
        return False
    return True

def matches_any_pattern(file_path, patterns):
    """检查文件路径是否匹配任何一个glob模式"""
    for pattern in patterns:
        if fnmatch.fnmatch(file_path, pattern):
            return True
    return False

def should_include_file(file_path, project_root):
    """v4健壮版本：先包含所有源代码，然后排除噪音"""
    # 转换为相对路径
    try:
        rel_path = os.path.relpath(file_path, project_root).replace(os.sep, '/')
    except ValueError:
        return False

    # 第一步：检查是否是我们关心的源代码文件类型
    _, ext = os.path.splitext(file_path)
    if ext.lower() not in SOURCE_CODE_EXTENSIONS:
        return False

    # 第二步：检查是否匹配任何排除模式
    for exclude_pattern in EXCLUDE_PATTERNS:
        if fnmatch.fnmatch(rel_path, exclude_pattern):
            return False

    # 如果既是源代码文件，又不匹配排除模式，就包含它
    return True

def collect_files_to_review(project_root):
    """收集所有需要审查的文件"""
    files_to_review = set()
    
    for root, dirs, files in os.walk(project_root):
        # 过滤目录
        dirs[:] = [d for d in dirs if should_include_dir(os.path.join(root, d))]
        
        for file in files:
            file_path = os.path.join(root, file)
            if should_include_file(file_path, project_root):
                rel_path = os.path.relpath(file_path, project_root)
                files_to_review.add(rel_path)
    
    return sorted(files_to_review)

def get_file_tree(root_path, prefix=""):
    items = []
    try:
        entries = sorted(os.listdir(root_path))
        
        filtered_entries = [
            e for e in entries 
            if os.path.join(root_path, e) not in EXCLUDE_FILES
        ]
        
        dirs = [d for d in filtered_entries if os.path.isdir(os.path.join(root_path, d)) and should_include_dir(d)]
        files = [f for f in filtered_entries if os.path.isfile(os.path.join(root_path, f)) and f not in EXCLUDE_FILES]
        
        all_entries = dirs + files
        for i, entry_name in enumerate(all_entries):
            is_last = i == len(all_entries) - 1
            connector = "└── " if is_last else "├── "
            items.append(f"{prefix}{connector}{entry_name}{'/' if entry_name in dirs else ''}")
            
            if entry_name in dirs:
                new_prefix = prefix + ("    " if is_last else "│   ")
                items.extend(get_file_tree(os.path.join(root_path, entry_name), new_prefix))
    except PermissionError:
        items.append(f"{prefix}└── [Permission Denied]")
    return items

def read_file_content(file_path):
    encodings = ['utf-8', 'gbk', 'latin-1']
    for encoding in encodings:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                return f.read()
        except Exception:
            continue
    return f"[Error: Unable to decode file '{os.path.basename(file_path)}' with common encodings]"

def generate_core_review_file(project_root):
    output_filename = 'bookworm_code_review.txt'
    output_filepath = os.path.join(project_root, output_filename)
    
    # 收集所有要审查的文件
    files_to_review = collect_files_to_review(project_root)
    
    with open(output_filepath, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\nBOOKWORM PROJECT - ESSENTIAL CODE REVIEW (UNREDACTED)\n" + "=" * 80 + "\n")
        f.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Mode: Essential files only - Core business logic with original data.\n")
        f.write(f"Total files included: {len(files_to_review)} (精简版)\n\n")

        # f.write("### 📁 PROJECT FILE TREE ###\n" + "-" * 40 + "\n")
        # f.write(f"{os.path.basename(project_root)}/\n")
        # for item in get_file_tree(project_root):
        #     f.write(item + "\n")
        # f.write("\n\n")
        
        # 按类型分组显示文件列表
        backend_files = [f for f in files_to_review if f.startswith('bookworm-backend')]
        frontend_files = [f for f in files_to_review if f.startswith('miniprogram')]
        root_files = [f for f in files_to_review if os.sep not in f and '/' not in f]
        
        f.write(f"### 📋 INCLUDED FILES SUMMARY ###\n" + "-" * 40 + "\n")
        f.write(f"Root files ({len(root_files)}): {', '.join(root_files) if root_files else 'None'}\n")
        f.write(f"Backend files ({len(backend_files)}): {len(backend_files)} TypeScript/config files\n")
        f.write(f"Frontend files ({len(frontend_files)}): {len(frontend_files)} WeChat Mini Program files\n\n")
        
        f.write(f"### 📄 SOURCE CODE CONTENT ###\n" + "-" * 40 + "\n\n")

        for rel_path in files_to_review:
            full_path = os.path.join(project_root, rel_path)
            f.write("=" * 80 + f"\n### FILE: {rel_path}\n" + "=" * 80 + "\n\n")
            if os.path.exists(full_path) and os.path.isfile(full_path):
                content = read_file_content(full_path)
                f.write(content.strip() + "\n\n\n")
            else:
                f.write(f"[FILE NOT FOUND]\n\n\n")

        f.write("=" * 80 + "\nESSENTIAL CODE REVIEW REPORT GENERATION COMPLETE.\n" + "=" * 80 + "\n")
    
    return output_filepath

def main():
    project_root = os.getcwd()
    print("[START] Generating essential code review report for Bookworm (UNREDACTED)...")
    try:
        output_file = generate_core_review_file(project_root)
        files_count = len(collect_files_to_review(project_root))
        file_size = os.path.getsize(output_file)
        size_str = f"{file_size / 1024:.2f} KB" if file_size > 1024 else f"{file_size} bytes"
        print(f"[SUCCESS] Essential review report generated!")
        print(f"  - Output file: {os.path.basename(output_file)}")
        print(f"  - File size: {size_str}")
        print(f"  - Files included: {files_count} (smart inclusion algorithm)")
        print("[INFO] All core business files automatically detected and included.")
        print("[WARNING] This version contains original data - DO NOT share externally.")
    except Exception as e:
        print(f"[ERROR] Failed to generate report: {e}")

if __name__ == "__main__":
    main()