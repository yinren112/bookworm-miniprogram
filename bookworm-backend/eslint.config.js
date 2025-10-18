// bookworm-backend/eslint.config.js
import eslint from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  // Base config for all files
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...typescriptEslint.configs.recommended.rules,
      // Project-specific rule overrides
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Allow unused vars starting with _
      '@typescript-eslint/no-require-imports': 'warn', // Allow require() imports (legacy code)

      // Security: Prevent console.log in production code
      // Use Fastify logger (request.log) instead for structured logging
      'no-console': ['error', {
        allow: ['warn', 'error'], // Allow console.warn/error for critical startup errors
      }],

      // 护栏：禁止在非视图文件中使用 Prisma select/include 字面量
      // 所有 Prisma 查询的 select/include 必须通过 src/db/views/* 出口
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^(findMany|findFirst|findUnique|findUniqueOrThrow)$/] > ObjectExpression > Property[key.name="select"]',
          message: '禁止直接使用 Prisma select 字面量。请改用 src/db/views/* 中定义的视图选择器。这确保了数据访问的一致性和可维护性。',
        },
        {
          selector: 'CallExpression[callee.property.name=/^(findMany|findFirst|findUnique|findUniqueOrThrow)$/] > ObjectExpression > Property[key.name="include"]',
          message: '禁止直接使用 Prisma include 字面量。请改用 src/db/views/* 中定义的视图选择器。这确保了数据访问的一致性和可维护性。',
        },
      ],
    },
  },
  // Special config for database view definitions (允许 select/include)
  {
    files: ['src/db/views/**/*.ts', 'src/db/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off', // 视图定义文件中允许使用 select/include
    },
  },
  // Special config for test files
  {
    files: ['src/tests/**/*.ts', 'src/**/*.test.ts', 'tests/**/*.ts', '**/*.test.ts'],
    languageOptions: {
      globals: {
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      // Test files can be more lenient
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off', // Allow console.log in tests for debugging
      'no-restricted-syntax': 'off', // 测试中允许直接使用 Prisma select/include
    },
  },
  // Special config for mock files
  {
    files: ['src/tests/__mocks__/**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Special config for scripts, jobs, seeds (console.log allowed)
  {
    files: ['src/scripts/**/*.ts', 'src/jobs/**/*.ts', 'prisma/**/*.ts', 'scripts/**/*.{ts,js}', 'update-*.ts', 'upgrade-*.ts'],
    rules: {
      'no-console': 'off', // Allow console in scripts and background jobs
      'no-restricted-syntax': 'off', // Allow Prisma select/include in scripts
    },
  },
  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      '.turbo/',
      'vitest.*.config.ts',
      '*.cjs',
      'src/generated/',
      'public/',
      'prisma/migrations/',
    ],
  },
];