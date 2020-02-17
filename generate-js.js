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
        if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
            //TODO: something with doc comments and block comments
            edits.push({pos: node.pos, end: node.end});
        } else {
            if (node.type) {
                var pos, end;
                if (ts.isAsExpression(node) || (ts.isParameter(node) && node.questionToken)) {
                    pos = node.type.pos - 2;
                } else {
                    pos = node.type.pos - 1;
                }
                if (ts.isTypeAssertion(node)) {
                    end = node.type.end + 1;
                } else {
                    end = node.type.end;
                }
                edits.push({pos: pos, end: end});
            }
            if (node.typeParameters) {
                edits.push({pos: node.typeParameters.pos - 1, end: node.typeParameters.end + 1});
            }
        }
        ts.forEachChild(node, visit);
    }
}

function applyEditsToFile(filename) {
    var start = fs.readFileSync(filename, "utf8");
    var end = "";
    edits.sort((a, b) => b.end - a.end);

    for (var i = 1; i < edits.length; i++) {
        for (var j = i - 1; j > 0; j--) {
            if ((edits[j + 1].pos >= edits[j].pos && edits[j + 1].end <= edits[j].end)) {
                edits.splice(j + 1, 1);
                i--;
            }
        }
    }

    edits.forEach(edit => {
        end = "/*" + start.slice(edit.pos, edit.end) + "*/" + start.slice(edit.end) + end;
        start = start.slice(0, edit.pos)
    });
    end = start + end;
    fs.writeFileSync(filename, end);
    return end;
}

generateJavaScriptFile(process.argv.slice(2), {
    target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS, allowJs: false, lib: [], types: []
});
