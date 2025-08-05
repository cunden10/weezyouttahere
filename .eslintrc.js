module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  globals: {
    chrome: 'readonly',
    browser: 'readonly'
  },
  rules: {
    'no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_' 
    }],
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-var': 'error',
    'eqeqeq': 'warn',
    'curly': 'warn',
    'no-undef': 'error',
    'no-unreachable': 'error',
    'no-redeclare': 'error'
  },
  ignorePatterns: [
    'node_modules/',
    'build/',
    'dist/',
    '*.min.js'
  ]
};