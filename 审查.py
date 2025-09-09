#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bookworm 项目核心代码审查文件生成器
生成一个精简的、只包含核心业务逻辑和数据结构的代码报告。

使用方法:
1. 将此脚本保存为 `generate_review.py` 放在项目根目录。
2. 在终端中运行: `python generate_review.py`

输出:
    bookworm_code_review.txt
"""

import os
import datetime

# ==============================================================================
# 核心文件白名单 (THE ONLY THING THAT MATTERS)
# ==============================================================================
CORE_WHITELIST_FILES = {
    # --- 顶层文档与配置 ---
    'CLAUDE.md',
    '.gitignore',
    
    # --- 后端: 数据库结构 (The Heart) ---
    'bookworm-backend/prisma/schema.prisma',
    
    # --- 后端: 应用程序入口与路由 (The Brain) ---
    'bookworm-backend/src/index.ts',
    
    # --- 后端: 配置与数据库连接 (The Nervous System) ---
    'bookworm-backend/.env',
    'bookworm-backend/src/config.ts',
    'bookworm-backend/src/db.ts',
    
    # --- 后端: 核心业务逻辑 (The Muscle) ---
    'bookworm-backend/src/services/inventoryService.ts',
    'bookworm-backend/src/services/orderService.ts',
    'bookworm-backend/src/services/authService.ts',
    
    # --- 后端: 员工后台 (The "Good Taste" Part) ---
    'bookworm-backend/public/index.html',
    'bookworm-backend/public/main.js',
    
    # --- 后端: 依赖关系 ---
    'bookworm-backend/package.json',
    
    # --- 小程序端: 全局配置与结构 (The Cockpit Layout) ---
    'miniprogram/app.json',
    'miniprogram/app.js',
    'miniprogram/app.wxss',
    'miniprogram/config.js',
    
    # --- 小程序端: 关键业务逻辑 (The Cockpit Controls) ---
    'miniprogram/utils/auth.js',
    'miniprogram/pages/market/index.js',
    'miniprogram/pages/book-detail/index.js',
    'miniprogram/pages/order-confirm/index.js',
    'miniprogram/pages/orders/index.js',
    
    # --- 小程序端: 依赖关系 ---
    'miniprogram/package.json',
}

# 需要排除的目录
EXCLUDE_DIRS = {
    'node_modules', '.git', '__pycache__', 'dist',
    # 小程序开发者工具的本地配置
    '.idea', '.vscode', 'miniprogram_npm' 
}

# 需要排除的文件
EXCLUDE_FILES = {
    'package-lock.json', 'yarn.lock', '.DS_Store',
    'project.private.config.json'
}

def should_include_dir(dir_path):
    dir_name = os.path.basename(dir_path)
    return dir_name not in EXCLUDE_DIRS and not dir_name.startswith('.')

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
    
    with open(output_filepath, 'w', encoding='utf-8') as f:
        # 写入头部信息
        f.write("=" * 80 + "\n")
        f.write("BOOKWORM PROJECT - CORE CODE REVIEW\n")
        f.write("=" * 80 + "\n")
        f.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("Mode: Core files only. This report contains the architectural backbone of the project.\n\n")

        # 写入项目结构
        f.write("### 📁 PROJECT FILE TREE ###\n")
        f.write("-" * 40 + "\n")
        f.write(f"{os.path.basename(project_root)}/\n")
        for item in get_file_tree(project_root):
            f.write(item + "\n")
        f.write("\n\n")
        
        # 格式化白名单路径以适应当前操作系统
        normalized_whitelist = {path.replace('/', os.sep) for path in CORE_WHITELIST_FILES}
        
        # 写入文件内容
        sorted_files = sorted(list(normalized_whitelist))
        f.write(f"### 📄 CORE SOURCE FILES (Total: {len(sorted_files)}) ###\n")
        f.write("-" * 40 + "\n\n")

        for rel_path in sorted_files:
            full_path = os.path.join(project_root, rel_path)
            if os.path.exists(full_path) and os.path.isfile(full_path):
                f.write("=" * 80 + "\n")
                f.write(f"### FILE: {rel_path}\n")
                f.write("=" * 80 + "\n\n")
                content = read_file_content(full_path)
                f.write(content.strip() + "\n\n\n")
            else:
                # 明确指出哪些核心文件缺失了
                f.write("=" * 80 + "\n")
                f.write(f"### FILE NOT FOUND: {rel_path}\n")
                f.write("=" * 80 + "\n\n\n")

        f.write("=" * 80 + "\n")
        f.write("CORE CODE REVIEW REPORT GENERATION COMPLETE.\n")
        f.write("=" * 80 + "\n")
    
    return output_filepath

def main():
    # 假设脚本在项目根目录运行
    project_root = os.path.dirname(os.path.abspath(__file__))
    print("[START] Generating core code review report for Bookworm...")
    try:
        output_file = generate_core_review_file(project_root)
        file_size = os.path.getsize(output_file)
        size_str = f"{file_size / 1024:.2f} KB" if file_size > 1024 else f"{file_size} bytes"
        print(f"[SUCCESS] Report generated successfully!")
        print(f"  - Output file: {output_file}")
        print(f"  - File size: {size_str}")
    except Exception as e:
        print(f"[ERROR] Failed to generate report: {e}")

if __name__ == "__main__":
    main()