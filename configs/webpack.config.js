const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { exec } = require('child_process');
const process = require('process');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const marked = require('marked');
const { JSDOM } = require('jsdom');

const CWD = process.cwd();

// https://marked.js.org/using_advanced
marked.setOptions({
	highlight: function (code, lang) {
		try {
			const highlighter = require('highlight.js');
			const language = highlighter.getLanguage(lang) ? lang : 'plaintext';
			return highlighter.highlight(code, { language }).value;
		} catch (e) {
			console.log("highlight.js not installed. Skipping syntax highlighting.");
		}
	}
});

const BUILD_ID = (new Date()).getTime();

fs.writeFileSync('./src/build_id.json', JSON.stringify(BUILD_ID.toString()));


// TODO: Refactor these transforms out of here.
// TODO: Create a separate package to manage all of this for easy reuse on
// other projects.
// TODO: consider whether using the front-end framework for SSG would be safe,
// and intuitive, rather than having two completely separate rendering modes.

function distPath({ subpathOut = '', subpathIn = '' } = {}) {
	return function ({ context, absoluteFilename }) {
		const prefixIn = path.resolve(context, subpathIn);
		const prefixOut = path.resolve(context, 'dist', subpathOut);
		const relativeName = path.join('./', absoluteFilename.slice(prefixIn.toString().length));
		const fullOutPath = path.resolve(prefixOut, relativeName)
			.replace(/\.md$/, ".html");
		console.log(`Mapping ${relativeName} to ${fullOutPath}`);
		return fullOutPath;
	};
};

const layouts = {};
const CollectLayouts = {
	transformer: (content, path) => {
		// add one to dirname prefix to include separating slash
		const relativePath = path.slice(CWD.length + 1);
		layouts[relativePath] = content.toString();
		return layouts[relativePath];
	}
};

async function mermaid(text) {
	const tempbase = path.join(
		__dirname,
		`__mermaid_temp_${new Date().getTime()}`
	);
	const tempInput = `${tempbase}.txt`;
	const tempOutput = `${tempbase}.svg`;
	const pConfigPath = path.join(
		__dirname,
		'puppeteer-config.json'
	);

	console.log(`writing ${tempInput} ...`);
	fs.writeFileSync(tempInput, text);

	await new Promise((resolve, reject) => {
		const cmd = `npm exec mmdc -- -i "${tempInput}" -o "${tempOutput}" -b transparent -p "${pConfigPath}"`;
		console.log(`executing ${cmd} ...`);
		exec(cmd, {cwd: __dirname}, (err, stdout, stderr) => {
			if (err || stderr) {
				console.log('failed', {err, stdout, stderr});
				reject(err);
			} else {
				console.log('succeeded', stdout);
				resolve();
			}
		});
	});
	console.log(`mermaid CLI done generating ${tempOutput}`);

	const svg = fs.readFileSync(tempOutput);
	fs.unlinkSync(tempInput)
	fs.unlinkSync(tempOutput);

	return svg;
};

const SSG = {
	transformer: async (content, _path) => {
		let _meta = {};
		function meta(o) {
			_meta = o;
			return '';
		}

		let body;
		try {
			if (_path.endsWith('.md')) {
				let isInCodeBlock = false;
				const escapedMarkdown = content.toString().split(/\n/)
					.reduce((lines, line) => {
						if (isInCodeBlock) {
							lines[lines.length - 1] += "\n" + line;
						} else {
							lines.push(line);
						}
						if (line.startsWith('```')) {
							isInCodeBlock = !isInCodeBlock;
						}
						return lines;
					}, [])
					.map(l => l.trim()).join('\n')
					.replace(/(``+)/g, m => Array(m.length).fill('\\`').join(''))
				;
				const bodyMarkdown = eval('`' + escapedMarkdown + '`');
				const prebody = marked(bodyMarkdown);
				const { window } = new JSDOM(prebody, { querySelectorAll: true });

				if (window && window.document && window.document.body) {
					await Promise.all(
						[...window.document.body
							.querySelectorAll('.language-mermaid')
						].map(async mdNode => {
							const svg = await mermaid(mdNode.textContent);
							mdNode.parentNode.innerHTML = svg;
						})
					);
					body = window.document.body.innerHTML;
				} else {
					body = prebody;
				}

			} else {
				body = eval('`' + content + '`');
			}
		} catch (err) {
			console.error(`Could not parse page ${_path}`, err);
			throw err;
		}

		const metatags = Object.entries(_meta).map(([tag, content]) => {
			tag = tag.replace(/"/g, '&quot;');
			content = content.replace(/"/g, '&quot;');
			return `<meta name="${tag}" content="${content}" />`;
		}).join('\n');

		let title = _meta.title;

		// apply no layout if the document has already provided the
		// overarching html structure.
		if (!_meta.layout && body && (
			String(body).startsWith('<!doctype html>')
			|| String(body).startsWith('<html'))
		) {
			return body;
		}

		const layoutPath = path.join(
			'src',
			'layouts',
			(_meta.layout || 'default')
		) + '.html';

		const layout = layouts[layoutPath];

		try {
			return eval('`' + layout + '`');
		} catch (err) {
			console.error(`Could not parse layout ${layoutPath}`, err);
			throw err;
		}
	}
};

module.exports = (env, argv) => {
	var devtool = 'source-map';
	if (argv.mode == 'development') {
		devtool = 'eval-cheap-source-map';
	}

	const sources = ['./src/index.js']
		.concat(glob.sync('./src/layouts/**/*.js'))
		.concat(glob.sync('./src/routes/**/*.js'))
	;

	const entry = sources.reduce((files, path) => {
		if (path.match(/src\/routes/)) {
			files[path.toString().slice('./src/routes'.length)] = path;
		} else if (path.match(/src\/layouts/)) {
			files[path.toString().slice('./src/'.length)] = path;
		}
		return files;
	}, {});

	return {
		/*
		devServer: {
			contentBase: path.join(CWD, 'dist'),
			compress: true,
			open: true,
			port: 9999,
			watchContentBase: true,
			// liveReload: true,
			// hot: true
		},
		*/
		watchOptions: {
			ignored: [
				"**/dist/*",
				"**/node_modules/*"
			]
		},
		node: {
			__filename: true
		},
		entry,
		output: {
			filename: "[name]"
		},
		devtool,
		plugins: [

			// TODO: does it make sense to actually handle static assets
			// first? then layouts? then everything else?

			// handle layouts first. other things depend on them.
			new CopyWebpackPlugin({
				patterns: [
					{
						from: './src/layouts/**/*.html',
						to: distPath({
							subpathIn: 'src/layouts',
							subpathOut: 'layouts'
						}),
						transform: CollectLayouts,
						noErrorOnMissing: true,
					},
				]
			}),

			// now pages, etc.
			new CopyWebpackPlugin({
				patterns: [
					{
						from: 'static',
						noErrorOnMissing: true,
						priority: 10,
					},
					{
						from: './src/routes/**/*.md',
						to: distPath({ subpathIn: 'src/routes' }),
						transform: SSG,
						noErrorOnMissing: true,
						priority: 3,
					},
					{
						from: './src/routes/**/*.html',
						to: distPath({ subpathIn: 'src/routes' }),
						transform: SSG,
						noErrorOnMissing: true,
						priority: 3,
					},
					{
						from: './src/routes/**/*.css',
						to: distPath({ subpathIn: 'src/routes' }),
						noErrorOnMissing: true,
						// trasform: ???
						priority: 3,
					},
					{
						from: './src/routes/**/*.png',
						to: distPath({ subpathIn: 'src/routes' }),
						noErrorOnMissing: true,
						priority: 3,
					},
					{
						from: './src/routes/**/*.jpg',
						to: distPath({ subpathIn: 'src/routes' }),
						noErrorOnMissing: true,
						priority: 3,
					},
					{
						from: './src/routes/**/*.json',
						to: distPath({ subpathIn: 'src/routes' }),
						noErrorOnMissing: true,
						priority: 3,
					},
					{
						from: './src/routes/**/*.svg',
						to: distPath({ subpathIn: 'src/routes' }),
						noErrorOnMissing: true,
						priority: 3,
					},
					{
						from: './src/routes/**/*.mp3',
						to: distPath({ subpathIn: 'src/routes' }),
						noErrorOnMissing: true,
						priority: 3,
					},
				],
			})
		],
		module: {
			rules: [
				{
					test: /\.css$/,
					use: [
						// "style-loader",
						path.resolve(__dirname, '../node_modules/style-loader'),
						{
							// loader: "css-loader",
							loader: path.resolve(__dirname, '../node_modules/css-loader'),
							options: {
								// don't try to require() url assets
								url: false
							}
						}
					]
				},
				{
					test: /\.html$/,
					// loader: "file-loader",
					loader: path.resolve(__dirname, '../node_modules/file-loader'),
					options: {
						name: "[name].[ext]",
					}
				},
				{
					test: /\.mjs$/,
					resolve: {
						fullySpecified: false
					}
				},
				{
					test: /\.tpl$/,
					// use: "raw-loader",
					use: path.resolve(__dirname, '../node_modules/raw-loader')
				},
			]
		}
	};
};
