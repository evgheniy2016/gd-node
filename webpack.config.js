const webpack = require('webpack');
const path = require('path');
var fs = require('fs');

var nodeModules = {};
fs.readdirSync('node_modules')
    .filter(function(x) {
        return ['.bin'].indexOf(x) === -1;
    })
    .forEach(function(mod) {
        nodeModules[mod] = 'commonjs ' + mod;
    });

const config = {
    context: path.resolve(__dirname, 'src'),
    entry: './exchange.ts',
    target: 'node',
    resolve: {
        extensions: [ '.ts' ]
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].bundle.js'
    },
    externals: nodeModules,
    module: {
        rules: [{
            test: /\.ts$/,
            loader: 'ts-loader'
        }]
    }
};

module.exports = config;
