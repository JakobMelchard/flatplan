import globals from 'globals'
import base from '@jakobmelchard/config/eslint'

export default [
  ...base,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['sw.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['serve.js', 'test/**/*.js'], languageOptions: { globals: globals.node } },
]
