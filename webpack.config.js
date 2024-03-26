const path = require("path");
const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

module.exports = {
  entry: "./src/index.ts",
  mode: "production",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    // fallback: {
    //   buffer: require.resolve("buffer/"),
    // },
  },
  plugins: [
    new NodePolyfillPlugin({
      includeAliases: ["Buffer", "stream"],
    }),
  ],
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    library: "AtomBuilder",
    libraryTarget: "var",
  },
};
