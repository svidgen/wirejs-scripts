// ref
// 	plugins => https://webpack.js.org/contribute/writing-a-plugin/
//  hooks   => https://webpack.js.org/api/compiler-hooks/
//
// 		emit - 
//		beforeCompile - 
// 

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
		const { RawSource, OriginalSource } = webpack.sources;

		compiler
			.hooks
			.thisCompilation
			.tap("WirejsAPIPlugin", compilation => {
				compilation.hooks.processAssets.tap(
					{
					  name: "WirejsAPIPlugin",
					  stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
					},
					assets => {
						compilation.emitAsset(
							"../api/routes/someapi.js",
							new OriginalSource(`
							
							const { DomClass } = require('wirejs-dom');

							abc();

							xyz();
							`, './src/api/someapi.js')
						);
					}
				)
			});
	}
}

module.exports = WirejsAPIPlugin;