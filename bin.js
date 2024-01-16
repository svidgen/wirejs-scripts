#!/usr/bin/env node

const process = require('process');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');

const webpack = require('webpack');
const webpackConfigure = require('./configs/webpack.config');
const WebpackDevServer = require('webpack-dev-server');

const CWD = process.cwd();
const webpackConfig = webpackConfigure(process.env, process.argv);
const [_nodeBinPath, _scriptPath, action] = process.argv;
const processes = [];

async function compile(watch = false) {
	const stats = await new Promise((resolve, reject) => {
		if (watch) {
			compiler = webpack({
				...webpackConfig,
				mode: 'development'
			});

			const server = new WebpackDevServer({
				static: {
					directory: path.join(CWD, 'dist')
				},
				open: true,
			}, compiler);

			console.log('Starting server...');
			server.start().then(() => {
				resolve({});
			});

			resolve({});
		} else {
			console.log('wirejs instantiating webpack compiler');
			compiler = webpack(webpackConfig);
			compiler.run((err, res) => {
				console.log('wirejs invoking webpack compiler');
				if (err) {
					console.error('wirejs webpack compiler failed');
					console.error(err);
					reject(err);
				} else {
					console.error('wirejs webpack compiler succeeded');
					resolve(res);
				}
			});
		}
	});

	if (stats?.compilation?.errors?.length > 0) {
		console.log('wirejs compilation errors', stats.compilation.errors);
		throw new Error('Build failed.');
	}

	return stats;
}

const engine = {
	async build({ watch = false } = {}) {
		console.log('wirejs build starting');

		rimraf.sync('dist');
		console.log('wirejs cleared old dist folder');

		fs.mkdirSync('dist');
		console.log('wirejs recreated dist folder');

		try {

			await compile(watch);
			console.log('wirejs finished compile');
		} catch (err) {
			console.log(err);
		}
		console.log('wirejs build finished')
	},

	async start() {
		console.log('wirejs starting')
		this.build({ watch: true });

		await new Promise(resolve => {
			function exitGracefully() {
				console.log('Exiting gracefully ...');
				processes.forEach(p => p.kill());
				resolve();
			}
			process.on('SIGINT', exitGracefully);
			process.on('SIGTERM', exitGracefully);
		});

		// explicit exit forces lingering child processes to die.
		console.log('wirejs stopping')
		process.exit();
	}

};

if (typeof engine[action] === 'function') {
	console.log(`Running ${action} ... `);
	engine[action]().then(() => {
		console.log('All done!');
	});
} else {
	console.error(`Invalid wirejs-scripts action: ${action}`);
}