//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
	...tanstackConfig,
	{
		ignores: [
			'eslint.config.js',
			'vite.config.*',
			'prettier.config.*',
			'*.json',
		],
	},
]
