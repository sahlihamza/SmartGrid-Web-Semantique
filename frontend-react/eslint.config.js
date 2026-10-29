import js from '@eslint/js'
import globals from 'globals'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * Configuration ESLint (format plat).
 *
 * On garde volontairement les règles « classiques » de React
 * (rules-of-hooks / exhaustive-deps) plutôt que l'ensemble des règles du
 * React Compiler : l'application n'est pas compilée par le Compiler, et son
 * pattern de chargement de données (useEffect + fetch asynchrone) y est
 * signalé à tort.
 *
 * L'objectif principal reste la détection des identifiants non définis
 * (`no-undef`), une erreur que la compilation Vite ne relève pas.
 */
export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Le JSX moderne n'a plus besoin de React dans le scope.
      'react/react-in-jsx-scope': 'off',
      // Les composants sont typés par convention, pas via PropTypes.
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
]
