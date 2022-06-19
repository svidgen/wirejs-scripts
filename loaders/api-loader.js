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
			return `${method}: async (...args) =>
				fetch("/api/${relativePath}", {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify([{method: "${method}", args:[...args]}])
				}),
			`;
		}).join('\n') + '}';

		// return `
		// 	console.log("${relativePath}", ${Object.keys(api)});
		// `;
	} catch {
		throw new Error(
			"API modules must be importable/require()-able during build without side effects!"
		);
	}

};
