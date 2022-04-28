#!/usr/bin/env node

const process = require('process');
const child_process = require('child_process');
const concurrently = require('concurrently');
const rimraf = require('rimraf');
const fs = require('fs');

const exgratia = require('ex-gratia');
const webpack = require('webpack');
const webpackConfigure = require('./configs/webpack.config');

const webpackConfig = webpackConfigure(process.env, process.argv);

const [ nodeBinPath, scriptPath, action ] = process.argv;

const processes = [];

async function exec(cmd) {
	console.log('exec', cmd);
	return new Promise((resolve, reject) => {
		let proc;
		proc = child_process.exec(cmd, (error, stdout, stderr) => {
			processes.splice(processes.indexOf(proc), 1);
			if (error || stderr) {
				reject({error, stderr});
			} else {
				resolve(stdout);
			}
		});
		processes.push(proc);
	});
}

async function compile() {
	const stats = await new Promise((resolve, reject) => {
		const compiler = webpack(webpackConfig);
		compiler.run((err, res) => {
			if (err) {
				reject(err);
			} else {
				resolve(res);
			}
		});
	});
	if (stats.compilation.errors.length > 0) {
		console.log(stats.compilation.errors);
		throw new Error('Build failed.');
	}
	return stats;
}

const engine = {

	async build({watch = false} = {}) {
		rimraf.sync('dist');
		fs.mkdirSync('dist');
		try {
			// await exec('npm run ex-gratia');
			// await exec(`npm run webpack -c "${__dirname}/configs/webpack.config.js"`);
			await compile();
		} catch (err) {
			console.log(err);
		}
	},

	async start() {
	}

};

function exitGracefully() {
	processes.forEach(p => p.kill());
}

process.on('SIGINT', exitGracefully);
process.on('SIGTERM', exitGracefully);

if (typeof engine[action] === 'function') {
	console.log(`Running ${action} ... `);
	engine[action]().then(() => {
		console.log('All done!');
	});
} else {
	console.error(`Invalid wirejs-scripts action: ${action}`);
}
