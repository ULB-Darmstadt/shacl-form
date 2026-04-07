import { vitePlugin } from '@remcovaes/web-test-runner-vite-plugin'
import { puppeteerLauncher } from '@web/test-runner-puppeteer'

export default{
  files: 'test/**/*.test.ts',
  nodeResolve: true,
  testFramework: {
    config: {
      timeout: '10000',
    },
  },
  plugins: [vitePlugin({
    optimizeDeps: {
      exclude: ['@open-wc/testing', 'rdf-isomorphic'],
    },
  })],
  browsers: [
    puppeteerLauncher({
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    }),
  ],
  filterBrowserLogs: ({args}) => !(args.length && typeof args[0] === 'string' && (args[0]?.startsWith('Lit is in dev mode') || args[0]?.indexOf('rokit-select') > -1))
}
