import { vitePlugin } from '@remcovaes/web-test-runner-vite-plugin'
import { chromeLauncher } from '@web/test-runner-chrome'

export default{
  files: 'test/**/*.test.ts',
  nodeResolve: true,
  plugins: [vitePlugin()],
  filterBrowserLogs: ({args}) => !(args.length && (args[0].startsWith('Lit is in dev mode') || args[0].indexOf('rokit-select') > -1)),
  browsers: [
    chromeLauncher({
      concurrency: 1, // Otherwise tests time out in Chrome
    }),
  ]
}