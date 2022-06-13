// thanks to https://redd.one/blog/writing-custom-webpack-loader

const path = require('path')
const CWD = process.cwd();

module.exports = function(source) {
	// webpack provides filename through `this.resourcePath`
	const filename = path.basename(this.resourcePath);
	const relativePath = this.resourcePath.substring(
		`${CWD}/src/api/`.length
	);

	try {
		const compiled = require(this.resourcePath);

		return `
			console.log("${relativePath}", ${Object.keys(compiled)});
		`;
	} catch {
		throw new Error(
			"API modules must be importable/require()-able during build without side effects!"
		);
	}
	
};