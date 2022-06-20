#!/usr/bin/env node

const process = require('process');
const child_process = require('child_process');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');

const exgratia = require('ex-gratia');
const webpack = require('webpack');
const webpackConfigure = require('./configs/webpack.config');
const WebpackDevServer = require('webpack-dev-server');

const CWD = process.cwd();
const webpackConfigs = webpackConfigure(process.env, process.argv);
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

async function handleApiResponse(req, res) {
	// req. headers, url, method, params, query
	const {
		headers, url, method, params, query,
		baseUrl, originalUrl, trailers
	} = req;

	// `query` is an object of querystring params.
	// `url` is the relative url including query
	// `headers` is an object like `{[name]: string}`
	const _path = url.match(/([^?]*)/)[1];
	const endpoint = _path.match(
		/\/api\/?(.+\.js)?$/
	)[1];

	if (endpoint) {
		const body = await postData(req);
		const calls = JSON.parse(body);

		// This path will actually be written to for deployment to other
		// hosting providers ... AWS, express, etc.
		//
		// const apiPath = path.join(
		// 	CWD, 'api', 'routes', endpoint
		// );

		const apiPath = path.join(
			CWD, 'src', 'api', endpoint
		);

		Object.keys(require.cache).forEach(function(key) { delete require.cache[key] })
		const api = require(apiPath);
		const responses = [];

		for (const call of calls) {
			try {
				if (typeof api[call.method] === 'function') {
					responses.push({data:
						await api[call.method](...call.args)
					});
				} else {
					responses.push({error: "Method not found"});
				}
			} catch (error) {
				responses.push({error});
			}
		}

		res.send(JSON.stringify(
			responses
		));
	} else {
		res.status(404);
		res.send("404 - Endpoint not found");
	}
}

async function postData(request) {
	return new Promise((resolve, reject) => {
		const buffer = [];
		const timeout = setTimeout(() => {
			reject("Post data not received.");
		}, 5000);
		request.on('data', data => buffer.push(data));
		request.on('end', () => {
			if (!timeout) return;
			clearTimeout(timeout);
			resolve(buffer.join(''));
		});
	});
};


async function compile(watch = false) {
	const stats = await new Promise((resolve, reject) => {
		if (watch) {
			compiler = webpack(
				webpackConfigs.map(config => ({
					...config,
					mode: 'development'
				}))
			);

			const server = new WebpackDevServer({
				static: {
					directory: path.join(CWD, 'dist')
				},
				open: true,
				proxy: {
					"/api": { bypass: handleApiResponse }
				}},
				compiler
			);

			console.log('Starting server...');
			server.start().then(() => {
				resolve({});
			});
		} else {
			compiler = webpack(webpackConfigs);
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
		rimraf.sync('api');
		fs.mkdirSync('api');
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
