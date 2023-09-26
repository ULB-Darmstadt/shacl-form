const path = require('path');

module.exports = [

    {
        entry: {
            'index': './src/index.ts',
        },
        experiments: {
            outputModule: true,
        },
        output: {
            filename: '[name].js',
            library: {
                type: 'module',
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /src\/plugins/,
                },
                {
                    test: /\.css$/i,
                    use: ["style-loader", "css-loader"],
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            fallback: {
                // "buffer": require.resolve("buffer/"),
                // "stream": require.resolve("stream-browserify")
            }
        },
    },
    {
        entry: {
            'index-with-plugins': './src/index-with-plugins.ts',
        },
        experiments: {
            outputModule: true,
        },
        output: {
            filename: '[name].js',
            library: {
                type: 'module',
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                },
                {
                    test: /\.css$/i,
                    use: ["style-loader", "css-loader"],
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            fallback: {
                // "buffer": require.resolve("buffer/"),
                // "stream": require.resolve("stream-browserify")
            }
        },
        devServer: {
            static: [
                { directory: path.join(__dirname, 'demo'), serveIndex: true },
            ],
            compress: true,
            hot: true,
            port: 8080,
        },
        devtool: "source-map",
    },
];