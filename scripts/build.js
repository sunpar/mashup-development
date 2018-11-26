const webpack = require("webpack");
const fs = require("fs-extra");
const { Observable, of, concat, empty, defer } = require("rxjs");
const { last, mapTo, switchMapTo, switchMap } = require("rxjs/operators");
const R = require("ramda");
const zipdir = require("zip-dir");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

// const extensionName = R.last(process.argv);
const extensionName = process.env.MASHUP_NAME;
const shouldWatch = process.argv.some(R.equals("-w"));
const shouldDeploy = process.env.EXTENSION_DIRECTORY !== "";

// make dist folder
const createDistFolder = R.pipe(
  R.concat("./dist/"),
  fs.ensureDir
);

// copy the qExt file to the dist folder
const copyQext = name =>
  fs.copy(
    `./${name}.qext`,
    `./dist/${name}.qext`
  );

// copy the files to the target extension directory
const deployExt = name =>
  shouldDeploy
    ? defer(() =>
        fs.copy(
          `./dist`,
          path.join(process.env.EXTENSION_DIRECTORY, name)
        )
      )
    : empty();

// compile the code using webpack
const compiler = name =>
  webpack({
    entry: [`./${name}.js`],
    output: {
      path: `${process.cwd()}/dist`,
      filename: `${name}.js`
    },
    module: {
      loaders: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          loader: "babel-loader"
        },
        {
          test: /\.html$/,
          loader: "html-loader"
        },
        {
          test: /\.scss$/,
          use: [
            { loader: "style-loader" },
            { loader: "css-loader" },
            { loader: "sass-loader" }
          ]
        },
        {
          test: /\.css$/,
          use: [{ loader: "style-loader" }, { loader: "css-loader" }]
        },
        {
          test: /\.(png|svg|jpg|gif)$/,
          use: [
            {
              loader: "file-loader",
              options: {
                name: "[name].[ext]",
                publicPath: `/extensions/${name}/`
              }
            }
          ]
        }
      ]
    }
  });

const build = compiler =>
  Observable.create(observer =>
    compiler.run(() => {
      observer.next();
      observer.complete();
    })
  );

const watch = compiler =>
  Observable.create(observer =>
    compiler.watch({}, (err, stats) => {
      console.log(
        stats.toString({
          chunks: false,
          colors: true
        })
      );
      observer.next();
    })
  );

const compile = shouldWatch ? watch : build;

const zip = name =>
  Observable.create(observer =>
    zipdir(`./dist`, { saveTo: `./dist/${name}.zip` }, () => {
      observer.next();
      observer.complete();
    })
  );

const extCompiler = compiler(extensionName);

const copyFiles = concat(
  createDistFolder(extensionName),
  copyQext(extensionName)
).pipe(last());

// Copy files, compile, zip, deploy
copyFiles
  .pipe(
    switchMapTo(compile(extCompiler)),
    switchMapTo(zip(extensionName)),
    switchMapTo(deployExt(extensionName))
  )
  .subscribe();
