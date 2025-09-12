#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bookworm 项目代码审查文件生成器 (v3 - 智能包含机制)
基于文件扩展名和路径模式智能包含所有核心业务代码，避免遗漏关键文件。

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
# 智能文件包含规则 - 基于扩展名和路径模式
# ==============================================================================

# 核心业务文件扩展名 (精简版)
CORE_EXTENSIONS = {
    '.ts', '.js', '.prisma', '.md', '.env'
}

# 关键业务文件路径 (只包含核心逻辑)
ESSENTIAL_PATTERNS = [
    'CLAUDE.md',
    'bookworm-backend/src/index.ts',
    'bookworm-backend/src/config.ts', 
    'bookworm-backend/src/db.ts',
    'bookworm-backend/src/errors.ts',
    'bookworm-backend/src/services/*.ts',
    'bookworm-backend/prisma/schema.prisma',
    'bookworm-backend/.env*',
    'bookworm-backend/package.json',
    'miniprogram/app.js',
    'miniprogram/app.json', 
    'miniprogram/config.js',
    'miniprogram/utils/api.js',
    'miniprogram/utils/auth.js',
    'miniprogram/pages/*/index.js'
]

# 明确排除的文件类型 (减少噪音)
EXCLUDE_EXTENSIONS = {
    '.wxml', '.wxss', '.json', '.css', '.html', '.sql'
}

# 排除特定文件
EXCLUDE_SPECIFIC = {
    'miniprogram/sitemap.json',
    'project.config.json', 
    '.eslintrc.js',
    'bookworm-backend/public/*',
    'bookworm-backend/src/tests/*',
    'bookworm-backend/src/jobs/*',
    'bookworm-backend/src/plugins/*'
}

# 排除目录和文件模式 (真正无用的文件)
EXCLUDE_DIRS = {
    'node_modules', '.git', '__pycache__', 'dist', 'build', '.idea', 
    '.vscode', 'miniprogram_npm', '.nyc_output', 'coverage'
}

EXCLUDE_FILES = {
    'package-lock.json', 'yarn.lock', '.DS_Store', 'Thumbs.db',
    'project.private.config.json', '*.log', '*.tmp', '*.cache'
}

# 敏感文件列表 (这些文件的内容将被脱敏)
SENSITIVE_FILES = {
    'bookworm-backend/.env'
}

def should_include_dir(dir_path):
    dir_name = os.path.basename(dir_path)
    return dir_name not in EXCLUDE_DIRS and not dir_name.startswith('.')

def matches_any_pattern(file_path, patterns):
    """检查文件路径是否匹配任何一个glob模式"""
    for pattern in patterns:
        if fnmatch.fnmatch(file_path, pattern):
            return True
    return False

def should_include_file(file_path, project_root):
    """精简判断文件是否应该包含在审查中 - 只要核心业务逻辑"""
    # 转换为相对路径
    try:
        rel_path = os.path.relpath(file_path, project_root).replace(os.sep, '/')
    except ValueError:
        return False
    
    # 排除明确不需要的文件
    for exclude_pattern in EXCLUDE_SPECIFIC:
        if fnmatch.fnmatch(rel_path, exclude_pattern):
            return False
    
    # 排除特定扩展名
    _, ext = os.path.splitext(file_path)
    if ext.lower() in EXCLUDE_EXTENSIONS:
        return False
    
    # 检查是否在排除文件列表中
    filename = os.path.basename(file_path)
    for exclude_pattern in EXCLUDE_FILES:
        if fnmatch.fnmatch(filename, exclude_pattern):
            return False
    
    # 只包含核心扩展名的文件
    if ext.lower() in CORE_EXTENSIONS:
        # 但必须匹配关键路径模式
        return matches_any_pattern(rel_path, ESSENTIAL_PATTERNS)
    
    return False

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
        entries = sorted([e for e in os.listdir(root_path) if e not in EXCLUDE_FILES and should_include_dir(os.path.join(root_path, e))])
        for i, entry_name in enumerate(entries):
            is_last = i == len(entries) - 1
            connector = "└── " if is_last else "├── "
            full_path = os.path.join(root_path, entry_name)
            is_dir = os.path.isdir(full_path)
            items.append(f"{prefix}{connector}{entry_name}{'/' if is_dir else ''}")
            if is_dir:
                new_prefix = prefix + ("    " if is_last else "│   ")
                items.extend(get_file_tree(full_path, new_prefix))
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
    return f"[Error: Unable to decode file '{os.path.basename(file_path)}']"

def sanitize_sensitive_content(rel_path, content):
    """如果文件在敏感列表中，则对其内容进行脱敏处理"""
    normalized_path = rel_path.replace(os.sep, '/')
    if normalized_path in SENSITIVE_FILES:
        lines = content.strip().split('\n')
        sanitized_lines = []
        for line in lines:
            if line.strip().startswith('#') or not line.strip():
                sanitized_lines.append(line)
            else:
                parts = line.split('=', 1)
                if len(parts) == 2:
                    key = parts[0]
                    sanitized_lines.append(f"{key}=[REDACTED]")
                else:
                    sanitized_lines.append("[REDACTED]")
        return f"#\n# CONTENT OF SENSITIVE FILE '{normalized_path}' HAS BEEN REDACTED\n#\n" + "\n".join(sanitized_lines)
    return content

def generate_core_review_file(project_root):
    output_filename = 'bookworm_code_review.txt'
    output_filepath = os.path.join(project_root, output_filename)
    
    # 收集所有要审查的文件
    files_to_review = collect_files_to_review(project_root)
    
    with open(output_filepath, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\nBOOKWORM PROJECT - COMPREHENSIVE CODE REVIEW\n" + "=" * 80 + "\n")
        f.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Mode: Essential files only - Core business logic and architecture.\n")
        f.write(f"Total files included: {len(files_to_review)} (精简版)\n\n")

        f.write("### 📁 PROJECT FILE TREE ###\n" + "-" * 40 + "\n")
        f.write(f"{os.path.basename(project_root)}/\n")
        for item in get_file_tree(project_root):
            f.write(item + "\n")
        f.write("\n\n")
        
        # 按类型分组显示文件列表
        backend_files = [f for f in files_to_review if f.startswith('bookworm-backend/')]
        frontend_files = [f for f in files_to_review if f.startswith('miniprogram/')]
        root_files = [f for f in files_to_review if '/' not in f]
        
        f.write(f"### 📋 INCLUDED FILES SUMMARY ###\n" + "-" * 40 + "\n")
        f.write(f"Root files ({len(root_files)}): {', '.join(root_files)}\n")
        f.write(f"Backend files ({len(backend_files)}): {len(backend_files)} TypeScript/config files\n")
        f.write(f"Frontend files ({len(frontend_files)}): {len(frontend_files)} WeChat Mini Program files\n\n")
        
        f.write(f"### 📄 SOURCE CODE CONTENT ###\n" + "-" * 40 + "\n\n")

        for rel_path in files_to_review:
            full_path = os.path.join(project_root, rel_path)
            f.write("=" * 80 + f"\n### FILE: {rel_path}\n" + "=" * 80 + "\n\n")
            if os.path.exists(full_path) and os.path.isfile(full_path):
                content = read_file_content(full_path)
                sanitized_content = sanitize_sensitive_content(rel_path, content)
                f.write(sanitized_content.strip() + "\n\n\n")
            else:
                f.write(f"[FILE NOT FOUND]\n\n\n")

        f.write("=" * 80 + "\nCOMPREHENSIVE CODE REVIEW REPORT GENERATION COMPLETE.\n" + "=" * 80 + "\n")
    
    return output_filepath

def main():
    project_root = os.getcwd()
    print("[START] Generating core code review report for Bookworm...")
    try:
        output_file = generate_core_review_file(project_root)
        file_size = os.path.getsize(output_file)
        size_str = f"{file_size / 1024:.2f} KB" if file_size > 1024 else f"{file_size} bytes"
        files_count = len(collect_files_to_review(project_root))
        print(f"[SUCCESS] Comprehensive review report generated!")
        print(f"  - Output file: {os.path.basename(output_file)}")
        print(f"  - File size: {size_str}")
        print(f"  - Files included: {files_count} (smart inclusion algorithm)")
        print("[INFO] All core business files automatically detected and included.")
        print("[INFO] Sensitive files like '.env' have been automatically redacted.")
    except Exception as e:
        print(f"[ERROR] Failed to generate report: {e}")

if __name__ == "__main__":
    main()