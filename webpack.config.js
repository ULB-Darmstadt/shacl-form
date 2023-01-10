const path = require('path');

module.exports = {
    entry: './src/index.ts',
    experiments: {
        outputModule: true,
    },
    output: {
        filename: 'index.js',
        library: {
            type: 'module',
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        fallback: {
            "buffer": require.resolve("buffer/"),
            "stream": require.resolve("stream-browserify")
        }
    },
    devServer: {
        static: [
            { directory: path.join(__dirname, 'public'), serveIndex: true },
        ],
        compress: true,
        hot: true,
        port: 8080,
    },
};