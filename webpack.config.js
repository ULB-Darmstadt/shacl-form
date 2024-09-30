const path = require('path');

module.exports = [
    {
        entry: {
            'form-default': './src/form-default.ts',
            'form-material': './src/form-material.ts',
            'form-bootstrap': './src/form-bootstrap.ts',
            'plugins/mapbox': './src/plugins/mapbox.ts',
            'plugins/leaflet': './src/plugins/leaflet.ts',
            'plugins/fixed-list': './src/plugins/fixed-list.ts',
            'plugins/file-upload': './src/plugins/file-upload.ts',
        },
        experiments: { outputModule: true },
        output: {
            filename: '[name].js',
            library: { type: 'module' },
        },
        externals: /^mdui/i,
        module: {
            rules: [
                { test: /\.tsx?$/, use: 'ts-loader' },
                { test: /\.css(\?raw)?$/i, use: ['raw-loader'] },
            ],
        },
        resolve: { extensions: ['.tsx', '.ts', '.js'] },
        devServer: {
            static: [ { directory: path.join(__dirname, 'demo'), serveIndex: true } ],
            compress: true,
            hot: true,
            port: 8080,
        },
        // devtool: "source-map",
    },
];
