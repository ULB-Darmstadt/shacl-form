const path = require('path');

module.exports = [
    {
        entry: { 'index': './src/form-native.ts' },
        experiments: { outputModule: true },
        output: {
            filename: '[name].js',
            library: { type: 'module' },
        },
        module: {
            rules: [
                { test: /\.tsx?$/, use: 'ts-loader', exclude: /src\/plugins/ },
                { test: /\.css$/i, use: ['raw-loader'] },
            ],
        },
        resolve: { extensions: ['.tsx', '.ts', '.js'] },
        devServer: {
            static: [
                // { directory: path.join(__dirname, 'public'), serveIndex: true },
                { directory: path.join(__dirname, 'demo'), serveIndex: true },
            ],
            compress: true,
            hot: true,
            port: 8080,
        },
        // devtool: "source-map",
    },
    {
        entry: { 'material': './src/form-material.ts' },
        experiments: { outputModule: true },
        output: {
            filename: '[name].js',
            library: { type: 'module' },
        },
        module: {
            rules: [
                { test: /\.tsx?$/, use: 'ts-loader', exclude: /src\/plugins/ },
                { test: /\.css$/i, use: ['raw-loader'] },
            ],
        },
        resolve: { extensions: ['.tsx', '.ts', '.js'] },
    },
    {
        entry: { 'bootstrap': './src/form-bootstrap.ts' },
        experiments: { outputModule: true },
        output: {
            filename: '[name].js',
            library: { type: 'module' },
        },
        module: {
            rules: [
                { test: /\.tsx?$/, use: 'ts-loader', exclude: /src\/plugins/ },
                { test: /\.css$/i, use: ['raw-loader'] },
            ],
        },
        resolve: { extensions: ['.tsx', '.ts', '.js'] },
    },
    {
        entry: {
            'plugins/mapbox': './src/plugins/mapbox.ts',
        },
        experiments: {
            outputModule: true,
        },
        // externals: ['@rdfjs/types', '../plugin', '../property-template', '../theme' ],
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
                    use: ['raw-loader'],
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
        },
    },
    {
        entry: {
            'plugins/fixed-list': './src/plugins/fixed-list.ts',
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
                    use: ['raw-loader'],
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
        },
    },
    {
        entry: { 'themes/material': './src/themes/material.ts' },
        experiments: { outputModule: true },
        output: {
            filename: '[name].js',
            library: { type: 'module' },
        },
        module: {
            rules: [
                { test: /\.tsx?$/, use: 'ts-loader', exclude: /src\/plugins/ },
                { test: /\.css$/i, use: ['raw-loader'] },
            ],
        },
        resolve: { extensions: ['.tsx', '.ts', '.js'] },
    },

];