import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import path from 'path'

export default defineConfig({
    plugins: [
        dts({
            rollupTypes: false,
            entryRoot: 'src',
            outDir: 'dist',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.spec.ts'],
        })
    ],
    build: {
        sourcemap: true,
        lib: {
            entry: {
                index: path.resolve(__dirname, 'src/index.ts'),
                googlePayClient: path.resolve(__dirname, 'src/googlePayClient.ts'),
                applePayClient: path.resolve(__dirname, 'src/applePayClient.ts'),
            },
            name: 'simplepay-js-sdk',
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
        },
        rolldownOptions: {
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