const path = require('path');
const rootPath = process.cwd();
const context = path.join(rootPath, "src");
const outputPath = path.join(rootPath, 'dist');
const bannerPlugin = require('./plugins/banner');

// Current directory + up two directories + path
function resolve (dir) {
  return path.resolve(__dirname, '../..', dir);
}

module.exports = {
  mode: "development",
  context: context,
  entry: {
    cornerstoneTools: './index.js'
  },
  target: 'web',
  output: {
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'umd',
    path: outputPath,
    umdNamedDefine: true
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  devtool: 'source-map',
  externals: {
    'cornerstone-math': {
      commonjs: "cornerstone-math",
      commonjs2: "cornerstone-math",
      amd: "cornerstone-math",
      root: 'cornerstoneMath'
    }
  },
  module: {
    rules: [{
      enforce: 'pre',
      test: /\.js$/,
      exclude: /(node_modules|test)/,
      loader: 'eslint-loader',
      options: {
        failOnError: false
      }
    }, {
      test: /\.js$/,
      exclude: /(node_modules)/,
      use: [{
        loader: 'babel-loader'
      }]
    }]
  },
  plugins: [
    bannerPlugin()
  ]
};
