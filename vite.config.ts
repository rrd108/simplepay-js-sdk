import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import path from 'path'

export default defineConfig({
    plugins: [
        dts({
            rollupTypes: true,
            outDir: 'dist'
        })
    ],
    build: {
        sourcemap: true,
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'simplepay-js-sdk',
            fileName: 'index'
        },
        rollupOptions: {
            output: [
                {
                    format: 'es',
                    entryFileNames: '[name].js',
                }
            ],
           external: ['crypto']
        }
    },
})