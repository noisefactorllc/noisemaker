import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'venv/**',
      '__pycache__/**',
      'docs/**',
      'shaders/to-port/**',
    ],
  },
  {
    ...pluginJs.configs.recommended,
    files: ['js/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'shaders/**/*.js'],
    languageOptions: {
      ...pluginJs.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        performance: 'readonly',
        scheduler: 'readonly',
        document: 'readonly',
        URL: 'readonly',
        global: 'writable',
        NOISEMAKER_PRESETS_DSL: 'readonly',
        glData: 'readonly',
        None: 'readonly',
      },
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^shape$|^time$|^speed$',
          varsIgnorePattern: '^h$|^w$|^c$',
          caughtErrors: 'none',
        },
      ],
      'no-undef': 'error',
    },
  },
];
