// ref
// 	plugins => https://webpack.js.org/contribute/writing-a-plugin/
//  hooks   => https://webpack.js.org/api/compiler-hooks/
//
// 		emit - 
//		beforeCompile - 
// 

const routerSource = `
`;

function apiIndex(assets) {
	const routes = Object.keys(assets).filter(r => 
		(r.startsWith("../api/routes/") || r.startsWith("..\\api\\routes\\"))
			&& r.endsWith(".js")
	).map(r => r.substring("../api/routes/".length));
	return `
	module.exports = {
		paths: ${JSON.stringify(routes, null, 2)}
	}
	`;
}

class WirejsAPIPlugin {
	constructor(options = {}) {

	}

	apply(compiler) {
		// webpack module instance can be accessed from the compiler object,
		// this ensures that correct version of the module is used
		// (do not require/import the webpack or any symbols from it directly).
		const { webpack } = compiler;

		// Compilation object gives us reference to some useful constants.
		const { Compilation } = webpack;

		// RawSource is one of the "sources" classes that should be used
		// to represent asset sources in compilation.
		const { OriginalSource } = webpack.sources;

		compiler
			.hooks
			.thisCompilation
			.tap("WirejsAPIPlugin", compilation => {
				compilation.hooks.processAssets.tap(
					{
					  name: "WirejsAPIPlugin",
					  stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
					},
					assets => {
						// console.log('assets', JSON.stringify(Object.keys(assets), null, 2));
						compilation.emitAsset(
							"../api/index.js",
							new OriginalSource(
								apiIndex(assets),
								'./src/api/index.js'
							)
						);
					}
				)
			});
	}
}

module.exports = WirejsAPIPlugin;