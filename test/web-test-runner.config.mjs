import { esbuildPlugin } from '@web/dev-server-esbuild';

export default{
  files: 'test/**/*.test.ts',
  nodeResolve: true,
  plugins: [esbuildPlugin({ ts: true })],
};