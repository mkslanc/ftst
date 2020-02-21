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
            ? ts.createSourceFile(fileName, sourceText.replace(/im(port.+)/g,"//$1"), languageVersion, false, ts.ScriptKind.TS)
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
        switch (true) {
            case ts.isTypeAliasDeclaration(node):
            case ts.isInterfaceDeclaration(node):
            case (ts.isFunctionDeclaration(node) && !node.body):
            case (ts.isMethodDeclaration(node) && !node.body):
            case (node.kind && node.kind == ts.SyntaxKind.PrivateKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.PublicKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.ProtectedKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.ReadonlyKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.AbstractKeyword):
                //TODO: maybe i will find better way to exclude overloads for functions and class methods
                edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                break;
            case (node.body && ts.isModuleDeclaration(node)):
                //TODO: maybe need some checks for crazy stuff like abstract namespace Example etc
                let moduleName = node.name.getText();

                if (node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent)) {
                    let textToPaste = "let " + moduleName + "; (function ("+ moduleName +")";
                    let parentModuleName = node.parent.parent.name.getText();
                    edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.body.pos, afterEnd: textToPaste});
                    textToPaste = ")(" + moduleName + " = "+ parentModuleName + "." + moduleName + " || (" + parentModuleName + "." + moduleName + " = {}));";
                    edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
                } else {
                    let textToPaste = (node.modifiers && node.modifiers.length > 0 ) ?
                        "export var " + moduleName + "; (function ("+ moduleName +")":
                        "var " + moduleName + "; (function ("+ moduleName +")";
                    edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.body.pos, afterEnd: textToPaste});
                    textToPaste = ")(" + moduleName + " || (" + moduleName + " = {}));";
                    edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
                }
                break;
            case (ts.isFunctionDeclaration(node) && node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent)):
            case (ts.isVariableStatement(node) && node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent)):
                if (node.modifiers && node.modifiers.length > 0) {
                    var check = node.modifiers.some(function (el) {
                        if (el.kind == ts.SyntaxKind.ExportKeyword) {
                            edits.push({pos: el.pos + el.getLeadingTriviaWidth(), end: el.end});
                            return true
                        }
                    });
                    if (check) {
                        let moduleName = node.parent.parent.name.getText();
                        if (ts.isFunctionDeclaration(node)) {
                            let constructionName = node.name.getText();
                            let textToPaste = moduleName + "." + constructionName + " = " + constructionName + ";";
                            edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
                        } else {
                            if (node.declarationList && node.declarationList.declarations) {
                                var i = 0;
                                while (i < node.declarationList.declarations.length) {
                                    if (node.declarationList.declarations[i].pos >= node.pos && node.declarationList.declarations[i].pos <= node.end)
                                        break;
                                    i++;
                                }
                                let stopCommentPos = node.declarationList.declarations[i].pos +
                                    node.declarationList.declarations[i].getLeadingTriviaWidth();
                                let textToPaste = moduleName + ".";
                                edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: stopCommentPos, afterEnd: textToPaste});
                            }
                        }
                    }
                }
            default:
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
                break;
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
            if (edits[j + 1].pos != edits[j + 1].end && edits[j + 1].pos >= edits[j].pos && edits[j + 1].end <= edits[j].end) {
                edits.splice(j + 1, 1);
                i--;
            }
        }
    }

    edits.forEach(edit => {
        let afterEnd = (edit.afterEnd)? edit.afterEnd : "";
        if (edit.pos === edit.end) {
            end = afterEnd + start.slice(edit.end) + end;
        } else {
            end = "/*" + start.slice(edit.pos, edit.end).replace(/\*\//g, "  ") + "*/" + afterEnd + start.slice(edit.end) + end;
        }
        start = start.slice(0, edit.pos)
    });
    end = start + end;
    fs.writeFileSync(filename, end);
    return end;
}

generateJavaScriptFile(process.argv.slice(2), {
    target: ts.ScriptTarget.ES5, module: "None", allowJs: false, lib: [], types: [], noEmit: true
});
