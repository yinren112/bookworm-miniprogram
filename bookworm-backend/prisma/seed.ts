// bookworm-backend/prisma/seed.ts

import { PrismaClient, book_condition, CourseStatus, QuestionType } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function buildCheatsheetStableKey(
  courseId: number,
  unitId: number | null,
  sheet: { title: string; assetType: string; version?: number },
): string {
  const unitPart = unitId ?? 0;
  const version = sheet.version ?? 1;
  const source = `${courseId}:${unitPart}:${sheet.assetType}:${sheet.title}:${version}`;
  return crypto.createHash('md5').update(source).digest('hex');
}

const booksToSeed = [
  {
    master: {
      isbn13: '9787111594251',
      title: '深入理解计算机系统（原书第3版）',
      author: 'Randal E. Bryant',
      publisher: '机械工业出版社',
      original_price: 139.00,
    },
    skus: [
      {
        edition: '原书第3版',
        cover_image_url: 'https://img3.doubanio.com/view/subject/l/public/s29634731.jpg',
        inventory: [
          { condition: book_condition.NEW, cost: 70.00, selling_price: 95.00 },
          { condition: book_condition.GOOD, cost: 50.00, selling_price: 75.50 },
          { condition: book_condition.ACCEPTABLE, cost: 30.00, selling_price: 45.00 },
        ],
      },
    ],
  },
  {
    master: {
      isbn13: '9787115428868',
      title: '代码整洁之道',
      author: 'Robert C. Martin',
      publisher: '人民邮电出版社',
      original_price: 59.00,
    },
    skus: [
      {
        edition: '中文版',
        cover_image_url: 'https://img1.doubanio.com/view/subject/l/public/s4418368.jpg',
        inventory: [
          { condition: book_condition.GOOD, cost: 25.00, selling_price: 38.00 },
          { condition: book_condition.GOOD, cost: 26.00, selling_price: 39.00 },
        ],
      },
    ],
  },
  {
    master: {
      isbn13: '9787115546029',
      title: '深入浅出Node.js',
      author: '朴灵',
      publisher: '人民邮电出版社',
      original_price: 69.00,
    },
    skus: [
      {
        edition: '第一版',
        cover_image_url: 'https://img9.doubanio.com/view/subject/l/public/s27204686.jpg',
        inventory: [
          { condition: book_condition.ACCEPTABLE, cost: 15.00, selling_price: 25.00 },
        ],
      },
    ],
  },
  {
    master: {
      isbn13: '9787508649719',
      title: 'Sapiens: A Brief History of Humankind',
      author: 'Yuval Noah Harari',
      publisher: '中信出版社',
      original_price: 68.00,
    },
    skus: [
      {
        edition: '中文版',
        cover_image_url: 'https://img2.doubanio.com/view/subject/l/public/s27371512.jpg',
        inventory: [
          { condition: book_condition.GOOD, cost: 30.00, selling_price: 42.00 },
        ],
      },
      {
        edition: '英文原版',
        cover_image_url: 'https://img2.doubanio.com/view/subject/l/public/s29810813.jpg',
        inventory: [
          { condition: book_condition.NEW, cost: 50.00, selling_price: 78.00 },
        ],
      }
    ],
  },
];

// ============================================
// 复习系统种子数据
// ============================================

const studyCoursesToSeed = [
  {
    courseKey: 'MA101',
    title: '高等数学（上）',
    description: '大学一年级高等数学核心内容，涵盖极限、导数、积分等基础知识点。',
    contentVersion: 1,
    locale: 'zh-CN',
    status: CourseStatus.PUBLISHED,
    units: [
      {
        unitKey: 'limit',
        title: '第一章 极限',
        orderIndex: 1,
        cards: [
          {
            contentId: 'MA101-limit-001',
            front: '极限的 $\\varepsilon$-$\\delta$ 定义是什么？',
            back: '设函数 $f(x)$ 在点 $x_0$ 的某去心邻域内有定义，若对于任意给定的 $\\varepsilon > 0$，总存在 $\\delta > 0$，使得当 $0 < |x - x_0| < \\delta$ 时，有 $|f(x) - A| < \\varepsilon$，则称 $A$ 为 $f(x)$ 当 $x \\to x_0$ 时的极限。',
            difficulty: 2,
          },
          {
            contentId: 'MA101-limit-002',
            front: '洛必达法则的适用条件是什么？',
            back: '洛必达法则适用于 $\\frac{0}{0}$ 型或 $\\frac{\\infty}{\\infty}$ 型不定式。使用前需确认：1) 分子分母同时趋于0或∞；2) 分子分母在去心邻域内可导；3) 分母导数不为0；4) 导数之比的极限存在（或为∞）。',
            difficulty: 3,
          },
          {
            contentId: 'MA101-limit-003',
            front: '两个重要极限是什么？',
            back: '第一重要极限：$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$\n\n第二重要极限：$\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x = e$ 或 $\\lim_{x \\to 0} (1 + x)^{\\frac{1}{x}} = e$',
            difficulty: 1,
          },
          {
            contentId: 'MA101-limit-004',
            front: '夹逼准则（Squeeze Theorem）是什么？',
            back: '若在某去心邻域内 $g(x) \\le f(x) \\le h(x)$，且 $\\lim g(x) = \\lim h(x) = A$，则 $\\lim f(x) = A$。常用于处理含三角函数、取整函数的极限。',
            difficulty: 2,
          },
        ],
        questions: [
          {
            contentId: 'MA101-limit-Q001',
            questionType: QuestionType.SINGLE_CHOICE,
            stem: '$\\lim_{x \\to 0} \\frac{\\sin x}{x}$ 的值是？',
            optionsJson: JSON.stringify(['A. 0', 'B. 1', 'C. $\\infty$', 'D. 不存在']),
            answerJson: 'b',
            explanationShort: '这是第一重要极限，利用夹逼准则可证明其值为1。',
            difficulty: 1,
          },
          {
            contentId: 'MA101-limit-Q002',
            questionType: QuestionType.SINGLE_CHOICE,
            stem: '以下哪种情况可以使用洛必达法则？',
            optionsJson: JSON.stringify(['A. $0 \\times \\infty$ 型', 'B. $\\frac{0}{0}$ 型', 'C. $1^{\\infty}$ 型', 'D. $\\infty - \\infty$ 型']),
            answerJson: 'b',
            explanationShort: '洛必达法则仅适用于 $\\frac{0}{0}$ 型和 $\\frac{\\infty}{\\infty}$ 型不定式，其他类型需要先转化。',
            difficulty: 2,
          },
          {
            contentId: 'MA101-limit-Q003',
            questionType: QuestionType.TRUE_FALSE,
            stem: '若 $\\lim f(x) = A$，$\\lim g(x) = B$，则 $\\lim f(x)g(x) = AB$。',
            optionsJson: JSON.stringify(['正确', '错误']),
            answerJson: 'a',
            explanationShort: '极限的乘法法则：两函数极限存在时，乘积的极限等于极限的乘积。',
            difficulty: 1,
          },
          {
            contentId: 'MA101-limit-Q004',
            questionType: QuestionType.FILL_BLANK,
            stem: '$\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x$ = ____',
            optionsJson: null,
            answerJson: 'e|E|2.718|2.71828',
            explanationShort: '这是第二重要极限，定义了自然对数的底数 $e \\approx 2.71828$。',
            difficulty: 2,
          },
        ],
      },
      {
        unitKey: 'derivative',
        title: '第二章 导数与微分',
        orderIndex: 2,
        cards: [
          {
            contentId: 'MA101-deriv-001',
            front: '导数的定义是什么？',
            back: "$$f'(x_0) = \\lim_{\\Delta x \\to 0} \\frac{f(x_0 + \\Delta x) - f(x_0)}{\\Delta x}$$\n\n导数表示函数在某点的瞬时变化率，几何意义是切线斜率。",
            difficulty: 1,
          },
          {
            contentId: 'MA101-deriv-002',
            front: '链式法则（Chain Rule）怎么用？',
            back: '若 $y = f(u)$，$u = g(x)$，则\n\n$$\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}$$\n\n即复合函数的导数等于外层函数对内层的导数乘以内层函数的导数。',
            difficulty: 2,
          },
          {
            contentId: 'MA101-deriv-003',
            front: '常见函数的导数公式（6个基本函数）',
            back: "1. $(x^n)' = n \\cdot x^{n-1}$\n2. $(\\sin x)' = \\cos x$\n3. $(\\cos x)' = -\\sin x$\n4. $(e^x)' = e^x$\n5. $(\\ln x)' = \\frac{1}{x}$\n6. $(a^x)' = a^x \\cdot \\ln a$",
            difficulty: 1,
          },
          {
            contentId: 'MA101-deriv-004',
            front: '隐函数求导的步骤是什么？',
            back: '1. 将方程两边同时对 $x$ 求导\n2. 把 $y$ 视为 $x$ 的函数，对含 $y$ 的项使用链式法则\n3. 解出 $\\frac{dy}{dx}$\n\n例：$x^2 + y^2 = 1 \\Rightarrow 2x + 2y \\cdot \\frac{dy}{dx} = 0 \\Rightarrow \\frac{dy}{dx} = -\\frac{x}{y}$',
            difficulty: 3,
          },
          {
            contentId: 'MA101-deriv-005',
            front: '什么是可微？可微与可导的关系？',
            back: '函数在 $x_0$ 可微：$\\Delta y = A \\cdot \\Delta x + o(\\Delta x)$，其中 $A$ 是常数，$o(\\Delta x)$ 是 $\\Delta x$ 的高阶无穷小。\n\n一元函数：可微 $\\Leftrightarrow$ 可导\n多元函数：可微 $\\Rightarrow$ 偏导存在（反之不成立）',
            difficulty: 3,
          },
        ],
        questions: [
          {
            contentId: 'MA101-deriv-Q001',
            questionType: QuestionType.SINGLE_CHOICE,
            stem: "$(x^3)' = ?$",
            optionsJson: JSON.stringify(['A. $x^2$', 'B. $3x^2$', 'C. $3x^3$', 'D. $\\frac{x^3}{3}$']),
            answerJson: 'b',
            explanationShort: "使用幂函数求导公式：$(x^n)' = n \\cdot x^{n-1}$，所以 $(x^3)' = 3x^2$。",
            difficulty: 1,
          },
          {
            contentId: 'MA101-deriv-Q002',
            questionType: QuestionType.SINGLE_CHOICE,
            stem: "若 $f(x) = \\sin(x^2)$，则 $f'(x) = ?$",
            optionsJson: JSON.stringify(['A. $\\cos(x^2)$', 'B. $2x \\cdot \\cos(x^2)$', 'C. $2x \\cdot \\sin(x^2)$', 'D. $-2x \\cdot \\cos(x^2)$']),
            answerJson: 'b',
            explanationShort: '使用链式法则：外层 $\\sin$ 对内层 $x^2$ 求导得 $\\cos(x^2)$，再乘以内层导数 $2x$。',
            difficulty: 2,
          },
          {
            contentId: 'MA101-deriv-Q003',
            questionType: QuestionType.TRUE_FALSE,
            stem: "若函数 $f(x)$ 在点 $x_0$ 可导，则 $f(x)$ 在 $x_0$ 一定连续。",
            optionsJson: JSON.stringify(['正确', '错误']),
            answerJson: 'a',
            explanationShort: '可导必连续是基本定理。但注意：连续不一定可导（如 $|x|$ 在 $x=0$ 处）。',
            difficulty: 2,
          },
          {
            contentId: 'MA101-deriv-Q004',
            questionType: QuestionType.FILL_BLANK,
            stem: "$(e^x)' = $ ____",
            optionsJson: null,
            answerJson: 'e^x|exp(x)',
            explanationShort: '$e^x$ 是唯一一个导数等于自身的函数。',
            difficulty: 1,
          },
        ],
      },
      {
        unitKey: 'integral',
        title: '第三章 积分',
        orderIndex: 3,
        cards: [
          {
            contentId: 'MA101-integ-001',
            front: '不定积分的定义是什么？',
            back: "若 $F'(x) = f(x)$，则\n\n$$\\int f(x)\\,dx = F(x) + C$$\n\n其中 $F(x)$ 称为 $f(x)$ 的原函数，$C$ 是任意常数。不定积分是所有原函数的集合。",
            difficulty: 1,
          },
          {
            contentId: 'MA101-integ-002',
            front: '换元积分法（第一类）的核心思想？',
            back: "凑微分法：\n\n$$\\int f(g(x)) \\cdot g'(x)\\,dx = \\int f(u)\\,du$$\n\n其中 $u = g(x)$\n\n技巧：观察被积函数，找出 \"一个函数\" 和 \"它的导数\" 的乘积形式。",
            difficulty: 2,
          },
          {
            contentId: 'MA101-integ-003',
            front: '分部积分公式是什么？',
            back: '$$\\int u\\,dv = uv - \\int v\\,du$$\n\n选择技巧（LIATE法则）：按 对数、反三角、代数、三角、指数 的顺序，靠前的选为 $u$，靠后的选为 $dv$。',
            difficulty: 2,
          },
        ],
        questions: [
          {
            contentId: 'MA101-integ-Q001',
            questionType: QuestionType.SINGLE_CHOICE,
            stem: '$\\int x^2\\,dx = ?$',
            optionsJson: JSON.stringify(['A. $2x + C$', 'B. $x^3 + C$', 'C. $\\frac{x^3}{3} + C$', 'D. $3x^3 + C$']),
            answerJson: 'c',
            explanationShort: '使用幂函数积分公式：$\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C$，所以 $\\int x^2\\,dx = \\frac{x^3}{3} + C$。',
            difficulty: 1,
          },
          {
            contentId: 'MA101-integ-Q002',
            questionType: QuestionType.SINGLE_CHOICE,
            stem: '$\\int e^x\\,dx = ?$',
            optionsJson: JSON.stringify(['A. $e^x + C$', 'B. $xe^x + C$', 'C. $e^{x+1} + C$', 'D. $\\ln(e^x) + C$']),
            answerJson: 'a',
            explanationShort: '$e^x$ 的积分等于自身：$\\int e^x\\,dx = e^x + C$。',
            difficulty: 1,
          },
          {
            contentId: 'MA101-integ-Q003',
            questionType: QuestionType.TRUE_FALSE,
            stem: '定积分 $\\int_a^b f(x)\\,dx$ 的值可能为负数。',
            optionsJson: JSON.stringify(['正确', '错误']),
            answerJson: 'a',
            explanationShort: '当 $f(x) < 0$ 时，定积分表示曲线与 $x$ 轴围成区域的"有向面积"，可以为负。',
            difficulty: 2,
          },
          {
            contentId: 'MA101-integ-Q004',
            questionType: QuestionType.FILL_BLANK,
            stem: '$\\int \\frac{1}{x}\\,dx = $ ____ $+ C$（$x > 0$）',
            optionsJson: null,
            answerJson: 'ln(x)|lnx|ln x|\\ln x|\\ln(x)',
            explanationShort: '$\\frac{1}{x}$ 的原函数是 $\\ln|x|$，当 $x > 0$ 时为 $\\ln x$。',
            difficulty: 1,
          },
        ],
      },
    ],
    // 急救包数据
    cheatSheets: [
      {
        title: '极限公式速查表',
        assetType: 'PDF',
        url: 'https://example.com/cheatsheets/MA101-limit-formulas.pdf',
        unitKey: 'limit',
      },
      {
        title: '导数公式大全',
        assetType: 'PDF',
        url: 'https://example.com/cheatsheets/MA101-derivative-formulas.pdf',
        unitKey: 'derivative',
      },
      {
        title: '积分公式表',
        assetType: 'IMAGE',
        url: 'https://example.com/cheatsheets/MA101-integral-table.png',
        unitKey: 'integral',
      },
    ],
  },
];

const contentToSeed = [
  {
    slug: 'terms-of-service',
    title: '用户服务协议',
    body: `
      <h2>用户服务协议</h2>
      <p>本服务面向校内二手教材流转，仅供注册用户在授权范围内使用。请您在下单、收货与售卖前确认所填信息真实、合法，不发布侵权或违法信息。</p>
      <p>当订单进入待取货或已售出状态时，请按通知时间前往约定地点完成交接；若需取消，请在支付前或支付后联系客服处理。平台对现金交易外的纠纷保留追责与冻结账户的权利。</p>
      <p>如您为工作人员账户，请遵守学校与平台的岗位要求，妥善保管取货码、付款凭证与仓库权限。</p>
    `,
  },
  {
    slug: 'privacy-policy',
    title: '隐私政策',
    body: `
      <h2>隐私政策</h2>
      <p>我们收集的必要信息包括：微信登录标识（openid）、手机号（用于账户合并与通知）、订单与库存记录。收集用途仅限于完成下单、支付、取货、售后与风控。</p>
      <p>我们不会公开展示您的手机号，所有日志默认进行脱敏处理。涉及支付的通知与证书将按最小权限保存在受控目录，并遵循学校及平台的合规要求。</p>
      <p>如需注销或导出账户数据，请联系客服，处理后将清除与您相关的个人标识与授权信息，但法律法规要求的记录除外。</p>
    `,
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    console.error('Refusing to run seed in production or staging.');
    process.exit(1);
  }

  console.log('Start seeding...');

  // To ensure idempotency, we first clean up the tables that represent physical items.
  // We don't delete BookMaster or BookSKU to preserve their IDs.
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  
  console.log('Cleaned up existing inventory and order data.');

  for (const book of booksToSeed) {
    await prisma.$transaction(async (tx) => {
      // Upsert BookMaster
      const bookMaster = await tx.bookMaster.upsert({
        where: { isbn13: book.master.isbn13 },
        update: book.master,
        create: book.master,
      });

      for (const skuData of book.skus) {
        // Upsert BookSKU
        const bookSku = await tx.bookSku.upsert({
          where: {
            master_id_edition: {
              master_id: bookMaster.id,
              edition: skuData.edition,
            },
          },
          update: {
            cover_image_url: skuData.cover_image_url,
          },
          create: {
            master_id: bookMaster.id,
            edition: skuData.edition,
            cover_image_url: skuData.cover_image_url,
          },
        });

        // Create InventoryItems
        if (skuData.inventory && skuData.inventory.length > 0) {
          await tx.inventoryItem.createMany({
            data: skuData.inventory.map(item => ({
              sku_id: bookSku.id,
              ...item,
            })),
          });
        }
      }
    });
    console.log(`Seeded book: ${book.master.title}`);
  }

  // Seed basic content pages (idempotent)
  for (const content of contentToSeed) {
    await prisma.content.upsert({
      where: { slug: content.slug },
      update: {
        title: content.title,
        body: content.body,
      },
      create: content,
    });
    console.log(`Seeded content: ${content.slug}`);
  }

  // ============================================
  // Seed Study Courses (idempotent)
  // ============================================
  console.log('Seeding study courses...');

  for (const courseData of studyCoursesToSeed) {
    await prisma.$transaction(async (tx) => {
      // Upsert Course
      const course = await tx.studyCourse.upsert({
        where: {
          courseKey_contentVersion: {
            courseKey: courseData.courseKey,
            contentVersion: courseData.contentVersion,
          },
        },
        update: {
          title: courseData.title,
          description: courseData.description,
          status: courseData.status,
        },
        create: {
          courseKey: courseData.courseKey,
          title: courseData.title,
          description: courseData.description,
          contentVersion: courseData.contentVersion,
          locale: courseData.locale,
          status: courseData.status,
        },
      });

      let totalCards = 0;
      let totalQuestions = 0;

      // Track units by key for cheatsheet linking
      const unitMap: Record<string, number> = {};

      // Upsert Units, Cards, and Questions
      for (const unitData of courseData.units) {
        const unit = await tx.studyUnit.upsert({
          where: {
            courseId_unitKey: {
              courseId: course.id,
              unitKey: unitData.unitKey,
            },
          },
          update: {
            title: unitData.title,
            orderIndex: unitData.orderIndex,
          },
          create: {
            courseId: course.id,
            unitKey: unitData.unitKey,
            title: unitData.title,
            orderIndex: unitData.orderIndex,
          },
        });

        unitMap[unitData.unitKey] = unit.id;

        // Upsert Cards
        for (let i = 0; i < unitData.cards.length; i++) {
          const cardData = unitData.cards[i];
          await tx.studyCard.upsert({
            where: {
              unitId_contentId: {
                unitId: unit.id,
                contentId: cardData.contentId,
              },
            },
            update: {
              front: cardData.front,
              back: cardData.back,
              difficulty: cardData.difficulty,
              sortOrder: i,
            },
            create: {
              courseId: course.id,
              unitId: unit.id,
              contentId: cardData.contentId,
              front: cardData.front,
              back: cardData.back,
              difficulty: cardData.difficulty,
              sortOrder: i,
            },
          });
          totalCards++;
        }

        // Upsert Questions (Phase 3)
        const questions = (unitData as { questions?: Array<{
          contentId: string;
          questionType: QuestionType;
          stem: string;
          optionsJson: string | null;
          answerJson: string;
          explanationShort: string;
          difficulty: number;
        }> }).questions || [];

        for (let i = 0; i < questions.length; i++) {
          const questionData = questions[i];
          await tx.studyQuestion.upsert({
            where: {
              unitId_contentId: {
                unitId: unit.id,
                contentId: questionData.contentId,
              },
            },
            update: {
              stem: questionData.stem,
              optionsJson: questionData.optionsJson ? JSON.parse(questionData.optionsJson) : null,
              answerJson: questionData.answerJson,
              explanationShort: questionData.explanationShort,
              difficulty: questionData.difficulty,
              questionType: questionData.questionType,
              sortOrder: i,
            },
            create: {
              courseId: course.id,
              unitId: unit.id,
              contentId: questionData.contentId,
              stem: questionData.stem,
              optionsJson: questionData.optionsJson ? JSON.parse(questionData.optionsJson) : null,
              answerJson: questionData.answerJson,
              explanationShort: questionData.explanationShort,
              difficulty: questionData.difficulty,
              questionType: questionData.questionType,
              sortOrder: i,
            },
          });
          totalQuestions++;
        }
      }

      // Upsert CheatSheets (Phase 4)
      const cheatSheets = (courseData as { cheatSheets?: Array<{
        title: string;
        assetType: string;
        url: string;
        unitKey?: string;
        version?: number;
      }> }).cheatSheets || [];

      for (let i = 0; i < cheatSheets.length; i++) {
        const sheetData = cheatSheets[i];
        const unitId = sheetData.unitKey ? unitMap[sheetData.unitKey] : null;
        const stableKey = buildCheatsheetStableKey(course.id, unitId, sheetData);

        // Delete existing and recreate (simpler than upsert for cheatsheets)
        await tx.studyCheatSheet.deleteMany({
          where: {
            courseId: course.id,
            title: sheetData.title,
          },
        });

        await tx.studyCheatSheet.create({
          data: {
            courseId: course.id,
            unitId,
            title: sheetData.title,
            stableKey,
            assetType: sheetData.assetType,
            url: sheetData.url,
            version: sheetData.version ?? 1,
            sortOrder: i,
          },
        });
      }

      // Update course totals
      await tx.studyCourse.update({
        where: { id: course.id },
        data: { totalCards, totalQuestions },
      });

      console.log(`Seeded course: ${courseData.title} (${totalCards} cards, ${totalQuestions} questions, ${cheatSheets.length} cheatsheets)`);
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
