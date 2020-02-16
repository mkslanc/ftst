"use strict";
var ts = require("typescript");
var fs = require("fs");
var edits = [];

function createCompilerHost(options) {
    return {
        getSourceFile: getSourceFile,
        getDefaultLibFileName: function () {
            return ts.getDefaultLibFileName(options)
        },
        writeFile: function (fileName, content) {
            return ts.sys.writeFile(fileName, content);
        },
        getCurrentDirectory: function () {
            return ts.sys.getCurrentDirectory();
        },
        getDirectories: function (path) {
            return ts.sys.getDirectories(path);
        },
        getCanonicalFileName: function (fileName) {
            return ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();
        },
        getNewLine: function () {
            return ts.sys.newLine;
        },
        useCaseSensitiveFileNames: function () {
            return ts.sys.useCaseSensitiveFileNames;
        },
        fileExists: fileExists,
        readFile: readFile,
        directoryExists: function (path) {
            return ts.sys.directoryExists(path);
        }
    };

    function fileExists(fileName) {
        return ts.sys.fileExists(fileName);
    }

    function readFile(fileName) {
        return ts.sys.readFile(fileName);
    }

    function getSourceFile(fileName, languageVersion, onError) {
        var sourceText = ts.sys.readFile(fileName);
        return sourceText !== undefined
            ? ts.createSourceFile(fileName, sourceText, languageVersion, false, ts.ScriptKind.TS)
            : undefined;
    }
}

function generateJavaScriptFile(path, options) {
    add(path[0]);

    function add(path) {
        try {
            var stat = fs.statSync(path);
        } catch (e) {
            return;
        }
        if (stat.isFile() && /\.ts$/.test(path)) {
            var fileArr = [];
            fileArr.push(path);
            var filename = path.replace(".ts", ".js");
            fs.copyFileSync(path, filename);
            commentAllTypes(fileArr, options);
            applyEditsToFile(filename);
            edits = [];
        } else if (stat.isDirectory()) {
            var files = fs.readdirSync(path).sort();
            files.forEach(function (name) {
                add(path + "/" + name)
            });
        }
    }
}

function commentAllTypes(fileNames, options) {
    var host = createCompilerHost(options);
    var program = ts.createProgram(fileNames, options, host);
    var checker = program.getTypeChecker();

    for (var _i = 0, _a = program.getSourceFiles(); _i < _a.length; _i++) {
        var sourceFile = _a[_i];
        if (!sourceFile.isDeclarationFile) {
            ts.forEachChild(sourceFile, visit);
        }
    }

    function visit(node) {
        var symbol = checker.getSymbolAtLocation(node.name);
        if (symbol) {
            if (node.type) {
                var pos;
                if (node.questionToken) {
                    pos = node.type.pos - 1;
                } else {
                    pos = node.type.pos;
                }
                edits.push({pos: pos, end: node.type.end});
            }
        }
        ts.forEachChild(node, visit);
    }
}

function applyEditsToFile(filename) {
    var start = fs.readFileSync(filename, "utf8");
    var end = "";
    edits
        .sort((a, b) => b.end - a.end)
        .forEach(edit => {
            end = "/*" + start.slice(edit.pos - 1, edit.end) + "*/" + start.slice(edit.end) + end;
            start = start.slice(0, edit.pos - 1)
        });
    end = start + end;
    fs.writeFileSync(filename, end);
    return end;
}

generateJavaScriptFile(process.argv.slice(2), {
    target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS, allowJs: false, lib: [], types: []
});
