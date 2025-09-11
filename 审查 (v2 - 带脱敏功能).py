#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bookworm 项目核心代码审查文件生成器 (v2 - 带脱敏功能)
生成一个精简的、只包含核心业务逻辑和数据结构的代码报告。

使用方法:
1. 将此脚本保存为 `审查.py` 放在项目根目录。
2. 在终端中运行: `python3 审查.py`

输出:
    bookworm_code_review.txt
"""

import os
import datetime

# ==============================================================================
# 核心文件白名单
# ==============================================================================
CORE_WHITELIST_FILES = {
    'CLAUDE.md', '.gitignore',
    'bookworm-backend/prisma/schema.prisma',
    'bookworm-backend/src/index.ts',
    'bookworm-backend/.env', 'bookworm-backend/src/config.ts', 'bookworm-backend/src/db.ts',
    'bookworm-backend/src/services/inventoryService.ts', 'bookworm-backend/src/services/orderService.ts', 'bookworm-backend/src/services/authService.ts',
    'bookworm-backend/public/index.html', 'bookworm-backend/public/main.js',
    'bookworm-backend/package.json',
    'miniprogram/app.json', 'miniprogram/app.js', 'miniprogram/app.wxss', 'miniprogram/config.js',
    'miniprogram/utils/auth.js', 'miniprogram/pages/market/index.js', 'miniprogram/pages/book-detail/index.js',
    'miniprogram/pages/order-confirm/index.js', 'miniprogram/pages/orders/index.js',
    'miniprogram/package.json',
}

# ==============================================================================
# 敏感文件列表 (这些文件的内容将被脱敏)
# ==============================================================================
SENSITIVE_FILES = {
    'bookworm-backend/.env'
}

EXCLUDE_DIRS = {'node_modules', '.git', '__pycache__', 'dist', '.idea', '.vscode', 'miniprogram_npm'}
EXCLUDE_FILES = {'package-lock.json', 'yarn.lock', '.DS_Store', 'project.private.config.json'}

def should_include_dir(dir_path):
    dir_name = os.path.basename(dir_path)
    return dir_name not in EXCLUDE_DIRS and not dir_name.startswith('.')

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
    
    with open(output_filepath, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\nBOOKWORM PROJECT - CORE CODE REVIEW\n" + "=" * 80 + "\n")
        f.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("Mode: Core files only. This report contains the architectural backbone of the project.\n\n")

        f.write("### 📁 PROJECT FILE TREE ###\n" + "-" * 40 + "\n")
        f.write(f"{os.path.basename(project_root)}/\n")
        for item in get_file_tree(project_root):
            f.write(item + "\n")
        f.write("\n\n")
        
        normalized_whitelist = {path.replace('/', os.sep) for path in CORE_WHITELIST_FILES}
        sorted_files = sorted(list(normalized_whitelist))
        f.write(f"### 📄 CORE SOURCE FILES (Total: {len(sorted_files)}) ###\n" + "-" * 40 + "\n\n")

        for rel_path in sorted_files:
            full_path = os.path.join(project_root, rel_path)
            f.write("=" * 80 + f"\n### FILE: {rel_path}\n" + "=" * 80 + "\n\n")
            if os.path.exists(full_path) and os.path.isfile(full_path):
                content = read_file_content(full_path)
                sanitized_content = sanitize_sensitive_content(rel_path, content)
                f.write(sanitized_content.strip() + "\n\n\n")
            else:
                f.write(f"[FILE NOT FOUND]\n\n\n")

        f.write("=" * 80 + "\nCORE CODE REVIEW REPORT GENERATION COMPLETE.\n" + "=" * 80 + "\n")
    
    return output_filepath

def main():
    project_root = os.getcwd()
    print("[START] Generating core code review report for Bookworm...")
    try:
        output_file = generate_core_review_file(project_root)
        file_size = os.path.getsize(output_file)
        size_str = f"{file_size / 1024:.2f} KB" if file_size > 1024 else f"{file_size} bytes"
        print(f"[SUCCESS] Report generated successfully!")
        print(f"  - Output file: {os.path.basename(output_file)}")
        print(f"  - File size: {size_str}")
        print("[INFO] Sensitive files like '.env' have been automatically redacted.")
    except Exception as e:
        print(f"[ERROR] Failed to generate report: {e}")

if __name__ == "__main__":
    main()