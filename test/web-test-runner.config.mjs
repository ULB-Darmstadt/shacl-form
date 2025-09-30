import { vitePlugin } from '@remcovaes/web-test-runner-vite-plugin';

export default{
  files: 'test/**/*.test.ts',
  nodeResolve: true,
  plugins: [vitePlugin()],
};