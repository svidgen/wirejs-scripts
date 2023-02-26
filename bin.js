#!/usr/bin/env node

const process = require('process');
const child_process = require('child_process');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');

const webpack = require('webpack');
const webpackConfigure = require('./configs/webpack.config');
const WebpackDevServer = require('webpack-dev-server');

const CWD = process.cwd();
const webpackConfig = webpackConfigure(process.env, process.argv);
const [nodeBinPath, scriptPath, action] = process.argv;
const processes = [];

async function exec(cmd) {
	console.log('exec', cmd);
	return new Promise((resolve, reject) => {
		let proc;
		proc = child_process.exec(cmd, (error, stdout, stderr) => {
			processes.splice(processes.indexOf(proc), 1);
			if (error || stderr) {
				reject({ error, stderr });
			} else {
				resolve(stdout);
			}
		});
		processes.push(proc);
	});
}

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
			compiler = webpack(webpackConfig);
			compiler.run((err, res) => {
				if (err) {
					reject(err);
				} else {
					resolve(res);
				}
			});
		}
	});

	if (stats?.compilation?.errors?.length > 0) {
		console.log(stats.compilation.errors);
		throw new Error('Build failed.');
	}

	return stats;
}

const engine = {
	async build({ watch = false } = {}) {
		rimraf.sync('dist');
		fs.mkdirSync('dist');
		try {
			await compile(watch);
		} catch (err) {
			console.log(err);
		}
	},

	async start() {
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
