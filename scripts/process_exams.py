import os
import subprocess
import re

# Mapping of PDF files to course folders and unit keys
FILE_MAPPING = {
    "西南大学《中国近现代史纲要》2021-2022学年第一学期期末试卷.pdf": ("HIS101", "exam_2021_2022_1"),
    "西南大学《大学物理》2020-2021学年第一学期期末试卷.pdf": ("PHY101", "exam_2020_2021_1"),
    "西南大学《大学物理》2023-2024学年第一学期期末试卷.pdf": ("PHY101", "exam_2023_2024_1"),
    "西南大学《概率论与数理统计》2020-2021学年第二学期期末试卷.pdf": ("PROB101", "exam_2020_2021_2"),
    "西南大学《概率论与数理统计》2021-2022学年第一学期期末试卷.pdf": ("PROB101", "exam_2021_2022_1"),
    "西南大学《概率论与数理统计》2022-2023学年第一学期期末试卷.pdf": ("PROB101", "exam_2022_2023_1"),
    "西南大学《毛泽东思想和中国特色社会主义理论体系概论》2022-2023学年第一学期期末试卷.pdf": ("MAO101", "exam_2022_2023_1"),
    "西南大学《毛泽东思想和中国特色社会主义理论体系概论》2023-2024学年第一学期期末试卷.pdf": ("MAO101", "exam_2023_2024_1"),
    "西南大学《线性代数》2020-2021学年第一学期期末试卷.pdf": ("MATH101", "exam_2020_2021_1"),
    "西南大学《马克思主义基本原理》2021-2022学年第一学期期末试卷.pdf": ("MARX101", "exam_2021_2022_1_v1"),
    "西南大学《马克思主义基本原理》2021-2022年第一学期期末试卷.pdf": ("MARX101", "exam_2021_2022_1_v2"),
    "西南大学《马克思主义基本原理》2023-2024学年第二学期期末试卷.pdf": ("MARX101", "exam_2023_2024_2"),
    "西南大学《高等数学》2020-2021第二学期期末试卷.pdf": ("CALC101", "exam_2020_2021_2"),
}

SOURCE_DIR = "待导入课程/复习资料211"
COURSES_ROOT = "courses"

def extract_text(pdf_path):
    print(f"Extracting: {pdf_path}")
    # Use pdftotext with layout preserving and UTF-8 encoding
    try:
        result = subprocess.run(['pdftotext', '-enc', 'UTF-8', '-layout', pdf_path, '-'], 
                                capture_output=True, text=True, encoding='utf-8')
        return result.stdout
    except Exception as e:
        print(f"Error extracting {pdf_path}: {e}")
        return ""

def clean_text(text):
    # Remove common headers/footers
    lines = text.split('\n')
    cleaned = []
    headers = [
        "西南大学", "参考答案和评分标准", "期末考试", "考试时间", "考核方式", 
        "拟定人", "学生类别", "适用专业", "得分", "签名", "特别提醒", 
        "阅卷须知", "绝密", "机密", "∣", "封", "线"
    ]
    for line in lines:
        if any(h in line for h in headers) and len(line.strip()) < 50:
            continue
        # Remove page numbers like "1", "2", "3" on a single line
        if re.match(r'^\s*\d+\s*$', line):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)

def parse_to_gift(text, course_key, unit_key):
    text = clean_text(text)
    questions = []
    
    # Split by common question markers
    # Looking for: 1、, 2. (数字+分隔符)
    parts = re.split(r'\n\s*(\d+)[、\. ]', text)
    
    if len(parts) > 1:
        # First part is probably header stuff not caught by clean_text
        for i in range(1, len(parts), 2):
            q_num = parts[i]
            q_body = parts[i+1] if i+1 < len(parts) else ""
            
            # Extract options
            options = re.findall(r'([A-E])[、\. ]\s*([^\s][^A-E\n]*)', q_body)
            # Remove options from body text for cleaner question stem
            q_stem = re.sub(r'[A-E][、\. ].*', '', q_body, flags=re.DOTALL).strip()
            
            # Further clean q_stem from leftovers
            q_stem = re.sub(r'\s+', ' ', q_stem)
            
            questions.append({
                "id": f"{course_key}-{unit_key}-Q{q_num.zfill(3)}",
                "text": q_stem,
                "options": [o[1].strip() for o in options],
                "type": "choice" if options else "fill"
            })

    # Convert to GIFT string
    gift_output = []
    for q in questions:
        # Limit question text length for safety
        txt = q['text'][:500]
        gift_str = f"::{q['id']}:: {txt} {{\n"
        if q["options"]:
            for i, opt in enumerate(q["options"]):
                prefix = "=" if i == 0 else "~"
                gift_str += f"  {prefix}{opt}\n"
        else:
            gift_str += "  =答案占位符\n"
        gift_str += "}\n"
        gift_output.append(gift_str)
    
    return "\n".join(gift_output)

def main():
    if not os.path.exists(COURSES_ROOT):
        os.makedirs(COURSES_ROOT)
        
    for pdf_file, (course_key, unit_key) in FILE_MAPPING.items():
        pdf_path = os.path.join(SOURCE_DIR, pdf_file)
        if not os.path.exists(pdf_path):
            print(f"File not found: {pdf_path}")
            continue
            
        text = extract_text(pdf_path)
        if not text: continue
        
        gift_content = parse_to_gift(text, course_key, unit_key)
        
        # Save to courses/<course_key>/questions/<unit_key>.gift
        dest_dir = os.path.join(COURSES_ROOT, course_key, "questions")
        if not os.path.exists(dest_dir):
            os.makedirs(dest_dir)
            
        dest_file = os.path.join(dest_dir, f"{unit_key}.gift")
        with open(dest_file, "w", encoding="utf-8") as f:
            f.write(gift_content)
        print(f"Saved: {dest_file}")

if __name__ == "__main__":
    main()
