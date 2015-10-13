var path = require('path');
var cheerio = require('cheerio');
var URI = require('URIjs');
var _ = require('lodash');
var Source = require('webpack/lib/Source');

/**
 * @class
 * @extends Source
 * @param {Module} sourceModule
 * @param {Chunk} sourceChunk
 * @param {Compilation} compilation
 */
function IndexHtmlSource(sourceModule, sourceChunk, compilation) {
    this.sourceModule = sourceModule;
    this.sourceChunk = sourceChunk;
    this.compilation = compilation;
}
module.exports = IndexHtmlSource;

IndexHtmlSource.prototype = Object.create(Source.prototype);
IndexHtmlSource.prototype.constructor = IndexHtmlSource;

IndexHtmlSource.prototype.source = function() {
    var html = this._getHtmlFromModule();
    var $ = cheerio.load(html);
    coalesceLinks($);
    this._resolveScripts($);
    return $.html();
};


/**
 * Extracts the HTML code from the module source
 */
IndexHtmlSource.prototype._getHtmlFromModule = function() {

    var compilation = this.compilation;
    var sourceChunk = this.sourceChunk;


    function moduleWasExtracted(module) {
        return module.loaders && module.loaders.some(function(loader) {
                return loader.match(/extract-text-webpack-plugin/);
            })
    }


    function getExtractTextLoaderOptions(module) {
        for (var i = 0; i < module.loaders.length; i++) {
            var loader = module.loaders[i];
            var match = loader.match(/extract-text-webpack-plugin[\\/]loader\.js\?({.*})/);
            if (match) {
                return JSON.parse(match[1]);
            }
        }
    }


    function getExtractedFilename(module) {

        var options = getExtractTextLoaderOptions(module);
        var loaderId = options && options.id;

        var extractTextPlugin = _.find(compilation.compiler.options.plugins,
            function (p) {
                return (p.constructor.name === 'ExtractTextPlugin') &&
                    ((typeof(p.id) === "undefined" && typeof(loaderId) === "undefined") || (p.id === loaderId));
            });

        var filenamePattern = extractTextPlugin.filename
            .replace(/\[(?:\w+:)?(contenthash)(?::[a-z]+\d*)?(?::(\d+))?]|([^\[\]]+)/ig,
            function(match, contentHash, maxLength, literalPart) {
                if (contentHash) {
                    if (maxLength) {
                        return '[a-f0-9]{1,' + maxLength + '}';
                    } else {
                        return '[a-f0-9]+';
                    }
                } else {
                    return regexpQuote(literalPart);
                }
            });
        filenamePattern = new RegExp(filenamePattern);

        return _.find(sourceChunk.files, function(filename) {
            return filename.match(filenamePattern);
        });
    }


    function __webpack_require__(moduleId) {

        var sourceModule;
        if (typeof moduleId === "number") {
            sourceModule = _.find(compilation.modules, function (m) {
                return m.id === moduleId;
            });
        } else {
            sourceModule = moduleId;
        }

        if (!sourceModule) {
            return undefined;
        }

        if (_.endsWith(sourceModule.context, path.normalize('webpack-dev-server/client')) ||
            _.endsWith(sourceModule.context, path.normalize('webpack/hot'))) {
            return undefined;

        } else if (moduleWasExtracted(sourceModule)) {
            return (compilation.options.output.publicPath || '') + getExtractedFilename(sourceModule);

        } else {
            var module = {};

            var source = sourceModule.source(null, {});
            eval(source.source());

            return module.exports;
        }
    }

    // This is where the "real" __webpack_require__ would store the public path,
    // it is used by url-loader to construct the link
    __webpack_require__.p = compilation.options.output.publicPath || '';

    return __webpack_require__(this.sourceModule);
};


/**
 * Resolve <script> tags that refer to entry points by replacing them with the final names of the bundles.
 * @param $
 */
IndexHtmlSource.prototype._resolveScripts = function($) {

    var compilation = this.compilation;
    var sourceContext = this.sourceModule.context;
    var additionalFiles = [];

    $('script').each(function () {
        var scriptSrc = $(this).attr('src');
        if (scriptSrc) {
            var scriptSrcUri = new URI(scriptSrc);
            if (!scriptSrcUri.is('absolute')) {

                var entry = path.resolve(sourceContext, scriptSrc);
                var moduleForEntry = _.find(compilation.modules, function (module) {
                    return module.resource && path.normalize(module.resource) === entry
                });
                if (moduleForEntry) {
                    var chunkForEntry = moduleForEntry.chunks[0];
                    var chunkJsFile = _.find(chunkForEntry.files, function (file) {
                        return new URI(file).filename().match(/\.js$/)
                    });
                    if (chunkJsFile) {
                        additionalFiles = additionalFiles.concat(_.without(chunkForEntry.files, chunkJsFile));
                        $(this).attr('src', (compilation.options.output.publicPath || '') + chunkJsFile);
                    }
                }
            }
        }
    });

    _.forEach(additionalFiles, function(file) {
        var uri = new URI(file);
        if (uri.filename().match(/\.css$/))
            $('head').append('<link rel="stylesheet" href="' + (compilation.options.output.publicPath || '') + uri + '">')
    });
};


function regexpQuote(s) {
    return s.toString().replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");
}


/**
 * Coalesce all links with the same rel and href into one
 * @param $
 */
function coalesceLinks($) {
    $('link').each(function () {
        var rel = $(this).attr('rel');
        var href = $(this).attr('href');
        $(this).nextAll("link[rel='" + rel + "'][href='" + href + "']").remove();
    });
}
