# IntroVideo V3 Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复视频白屏问题，并扩充项目亮点（急救包、刷题、课程），打造更完整、节奏更紧凑的 30 秒介绍视频。

**Architecture:** 
1. 修复白屏：重新计算并校准 `Root.tsx` 中的总帧数与转场时长的关系。
2. 内容扩充：在闪卡与连续学习之间，插入“刷题闯关”与“急救包”两个新场景。
3. 视觉优化：保持 V2 的 Glassmorphism 风格，增加对应的 Icon 与动效。

**Tech Stack:** React, Remotion, @remotion/transitions

---

### Task 1: Fix White Screen & Recalculate Duration

**Files:**
- Modify: `remotion/src/Root.tsx`

**Analysis:**
当前白屏原因是 `Root.tsx` 中的 `durationInFrames` 可能短于实际 Sequence + Transition 的总和，或者 Transition 计算方式有误（Transition 会吞掉部分时长）。

**Step 1: Calculate Total Duration**
- Scene 1 (Title): 120 frames
- Transition 1: 20 frames (overlap)
- Scene 2 (Flashcard): 150 frames
- Transition 2: 20 frames (overlap)
- Scene 3 (Quiz - New): 140 frames
- Transition 3: 20 frames (overlap)
- Scene 4 (Cheatsheet - New): 140 frames
- Transition 4: 20 frames (overlap)
- Scene 5 (Momentum): 150 frames
- Transition 5: 20 frames (overlap)
- Scene 6 (Outro): 90 frames

Total Frames Calculation:
120 + 150 + 140 + 140 + 150 + 90 - (20 * 5) = 790 - 100 = **690 frames** (approx 23s)

**Step 2: Update Root.tsx**
将 `durationInFrames` 设置为计算后的值。

---

### Task 2: Implement New Scenes (Quiz & Cheatsheet)

**Files:**
- Modify: `remotion/src/IntroVideo.tsx`

**Step 1: Create `QuizScene`**
- 展示“刷题”界面 Mockup。
- 亮点：多种题型（单选/填空）、错题本自动收录。
- 动效：题目切换、选项选中高亮。

**Step 2: Create `CheatsheetScene`**
- 展示“急救包”界面 Mockup。
- 亮点：考前速记、重点浓缩。
- 动效：文档展开、重点标记笔触。

**Step 3: Integrate into `IntroVideo`**
- 在 `TransitionSeries` 中插入这两个新场景。

---

### Task 3: Final Polish & Export

**Files:**
- Run: `npm run render`

**Step 1: Review Preview**
- 检查转场是否流畅。
- 确认文字无遮挡。

**Step 2: Render**
- 导出 `out/bookworm-intro-v3.mp4`。
