// thanks to https://redd.one/blog/writing-custom-webpack-loader

const path = require('path')
const CWD = process.cwd();

module.exports = function (source) {
	// webpack provides filename through `this.resourcePath`
	const filename = path.basename(this.resourcePath);
	const relativePath = this.resourcePath.substring(
		`${CWD}/src/api/`.length
	);

	try {
		const api = require(this.resourcePath);
		return 'module.exports = {' + [...Object.keys(api)].map(method => {
			// if (typeof method !== 'function') return;
			// const args = method.toString()
			// 	.match(/function ?\(([\w\d_,]+)\)/)[1];
			// return `${method}: async (${args}) =>
			return `${method}: async (...args) => {
				const response = await fetch("/api/${relativePath}", {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify([{method: "${method}", args:[...args]}])
				});
				const body = await response.json();
				const value = body[0].data;
				return value;
			}`;
		}).join('\n') + '}';

		// return `
		// 	console.log("${relativePath}", ${Object.keys(api)});
		// `;
	} catch (error) {
		console.error(error);
		throw new Error(error);
	}

};
