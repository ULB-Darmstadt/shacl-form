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
        devServer: {
            static: [
                // { directory: path.join(__dirname, 'public'), serveIndex: true },
                { directory: path.join(__dirname, 'demo'), serveIndex: true },
            ],
            compress: true,
            hot: true,
            port: 8080,
        },
        devtool: "source-map",
    },
    {
        entry: {
            'mapbox': './src/plugins/mapbox.ts',
        },
        experiments: {
            outputModule: true,
        },
        output: {
            filename: 'plugins/[name].js',
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
    },
    {
        entry: {
            'fixed-list': './src/plugins/fixed-list.ts',
        },
        experiments: {
            outputModule: true,
        },
        output: {
            filename: 'plugins/[name].js',
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
    },
    {
        entry: {
            'material': './src/themes/material.ts',
        },
        experiments: {
            outputModule: true,
        },
        output: {
            filename: 'themes/[name].js',
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
    },
    {
        entry: {
            'bootstrap': './src/themes/bootstrap.ts',
        },
        experiments: {
            outputModule: true,
        },
        output: {
            filename: 'themes/[name].js',
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
    },
];