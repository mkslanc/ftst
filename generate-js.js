"use strict";
var ts = require("typescript");
var fs = require("fs");

function createCompilerHost(options, code) {
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
        if (!code) {
            var sourceText = ts.sys.readFile(fileName);
        } else {
            var sourceText = code;
        }
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
            let edits = deTypescript(fileArr, options);
            applyEditsToFile(filename, edits);
        } else if (stat.isDirectory()) {
            var files = fs.readdirSync(path).sort();
            files.forEach(function (name) {
                add(path + "/" + name)
            });
        }
    }
}

function deTypescript(fileNames, options, code) {
    var host = createCompilerHost(options, code);
    var program = ts.createProgram(fileNames, options, host);
    var checker = program.getTypeChecker();
    var edits = [];
    var defaultCounter = 0;
    var exportExists = false;

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
            case (ts.isHeritageClause(node) && node.token && node.token == ts.SyntaxKind.ImplementsKeyword):
                //TODO: maybe i will find better way to exclude overloads for functions and class methods
                edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                break;
            case (node.kind && node.kind == ts.SyntaxKind.DeclareKeyword):
                edits.push({pos: node.parent.pos + node.parent.getLeadingTriviaWidth(), end: node.parent.end});
                break;
            case (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)):
                var className;
                if (hasDefaultModifier(node.parent) && !node.parent.name) {
                    className = "default_" + defaultCounter;
                } else {
                    if (!node.parent.name)
                        break;
                    className = node.parent.name.getText();
                }
                var constructionName = node.name.getText();
                if (node.decorators && node.decorators.length) {
                    edits.push({pos: node.decorators.pos, end: node.decorators.end});
                    var decorators = "__decorate([";
                    for (var i = 0; i < node.decorators.length; i++) {
                        decorators += node.decorators[i].expression.getText() + ",";
                    }
                    if (ts.isPropertyDeclaration(node)) {
                        decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", void 0);";
                    } else {
                        if (hasParametersDecorators(node)) {
                            decorators += commentOutParametersDecorators(node);
                        }
                        decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", null);";
                    }
                    edits.push({pos: node.parent.end, end: node.parent.end, afterEnd: decorators});
                } else {
                    if (hasParametersDecorators(node)) {
                        var decorators = "__decorate([";
                        decorators += commentOutParametersDecorators(node);
                        decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", null);";
                        edits.push({pos: node.parent.end, end: node.parent.end, afterEnd: decorators});
                    }
                }
                if (ts.isPropertyDeclaration(node) && !node.initializer) {
                    edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                }
                break;
            case (node.decorators && node.decorators.length && ts.isClassDeclaration(node)):
                var className = node.name.getText();
                let afterEnd = "let " + className + "= ";
                edits.push({
                    pos: node.decorators.pos + node.getLeadingTriviaWidth(),
                    end: node.decorators.end,
                    afterEnd: afterEnd
                });
                var decorators = ";" + className + "= __decorate([";
                for (var i = 0; i < node.decorators.length; i++) {
                    decorators += node.decorators[i].expression.getText() + ",";
                }
                decorators = decorators.slice(0, -1) + "], " + className + ");";
                edits.push({pos: node.end, end: node.end, afterEnd: decorators});
                break;
            case (node.body && ts.isModuleDeclaration(node) && !hasDeclareModifier(node)):
                //TODO: maybe need some checks for crazy stuff like abstract namespace Example etc
                let moduleName = node.name.getText();
                if (isInsideModule(node)) {
                    let textToPaste = "let " + moduleName + "; (function (" + moduleName + ")";
                    let parentModuleName = node.parent.parent.name.getText();
                    edits.push({
                        pos: node.pos + node.getLeadingTriviaWidth(),
                        end: node.body.pos,
                        afterEnd: textToPaste
                    });
                    if (hasExportModifier(node)) {
                        textToPaste = ")(" + moduleName + " = " + parentModuleName + "." + moduleName + " || (" + parentModuleName + "." + moduleName + " = {}));";
                    } else {
                        textToPaste = ")(" + moduleName + " || (" + moduleName + " = {}));";
                    }
                    edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
                } else {
                    let textToPaste = (hasExportModifier(node)) ?
                        "export var " + moduleName + "; (function (" + moduleName + ")" :
                        "var " + moduleName + "; (function (" + moduleName + ")";
                    edits.push({
                        pos: node.pos + node.getLeadingTriviaWidth(),
                        end: node.body.pos,
                        afterEnd: textToPaste
                    });
                    textToPaste = ")(" + moduleName + " || (" + moduleName + " = {}));";
                    edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
                }
                break;
            case (ts.isEnumDeclaration(node) && !hasDeclareModifier(node)):
                transformEnum(node);
                break;
            case (ts.isFunctionDeclaration(node) && hasExportModifier(node)):
                exportExists = true;
                transformExportFunction(node);
                break;
            case (ts.isVariableStatement(node) && hasExportModifier(node)):
                exportExists = true;
                transformExportVariable(node);
                break;
            case (ts.isImportEqualsDeclaration(node)):
                var textToPaste;
                if (node.moduleReference && ts.isExternalModuleReference(node.moduleReference)) {
                    exportExists = true;
                    textToPaste = 'const ';
                } else {
                    if (hasExportModifier(node)) {
                        textToPaste = getModuleName(node) + '.';
                    } else {
                        textToPaste = 'var '
                    }
                }
                edits.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: node.name.pos + 1,
                    afterEnd: textToPaste
                });
                break;
            case (ts.isClassDeclaration(node) && hasExportModifier(node)):
                exportExists = true;
                transformExportClass(node);
                break;
        }
        commentOutTypes(node);
        ts.forEachChild(node, visit);
    }

    function commentOutTypes(node) {
        if (node.type) {
            var pos, end;
            if (ts.isAsExpression(node) || (node.questionToken)) {
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
        if (node.typeArguments) {
            edits.push({pos: node.typeArguments.pos - 1, end: node.typeArguments.end + 1});
        }
        if (node.questionToken && ts.isParameter(node)) {
            edits.push({pos: node.questionToken.pos, end: node.questionToken.end});
        }
    }

    function hasDeclareModifier(node) {
        if (node.modifiers && node.modifiers.length > 0) {
            return node.modifiers.some(function (el) {
                if (el.kind == ts.SyntaxKind.DeclareKeyword) {
                    return true
                }
            });
        }
    }

    function hasDefaultModifier(node) {
        if (node.modifiers && node.modifiers.length > 0) {
            return node.modifiers.some(function (el) {
                edits.push({pos: el.pos + el.getLeadingTriviaWidth(), end: el.end});
                if (el.kind == ts.SyntaxKind.DefaultKeyword) {
                    return true
                }
            });
        }
    }

    function commentOutParametersDecorators(node) {
        let decorators = '';

        for (var i = 0; i < node.parameters.length; i++) {
            if (node.parameters[i].decorators && node.parameters[i].decorators.length) {
                for (var j = 0; j < node.parameters[i].decorators.length; j++) {
                    edits.push({
                        pos: node.parameters[i].decorators[j].pos,
                        end: node.parameters[i].decorators[j].end
                    });
                    decorators += "__param(" + i + "," + node.parameters[i].decorators[j].expression.getText() + "),";
                }
            }
        }

        return decorators;
    }

    function transformEnum(node) {
        let enumName = node.name.getText();
        let textToPaste, initializer;
        if (node.members && node.members.length > 0) {
            initializer = 0;
            for (var i = 0; i < node.members.length; i++) {
                if (node.members[i].initializer) {
                    if (node.members[i].initializer.kind == ts.SyntaxKind.ThisKeyword) {
                        initializer = "this";
                    } else {
                        initializer = checker.getConstantValue(node.members[i]);
                        if (initializer == undefined) {
                            initializer = node.members[i].initializer.getText();
                        }
                    }
                } else {
                    if (i != 0) {
                        if (node.members[i - 1].initializer && typeof node.members[i - 1].initializer.getText() === "number") {
                            initializer = parseInt(node.members[i - 1].initializer.getText()) + 1;
                        } else {
                            initializer++;
                        }
                    }
                }
                let end;
                if (i !== node.members.length - 1) {
                    end = node.members[i + 1].pos;
                } else {
                    if (node.members.hasTrailingComma == true) {
                        end = node.members[i].end + 1;
                    } else {
                        end = node.members[i].end;
                    }
                }
                let memberName = (/"(.)+"/.test(node.members[i].name.text) || ts.isNumericLiteral(node.members[i].name)) ? node.members[i].name.text : '"' + node.members[i].name.text + '"';
                textToPaste = enumName + "[" + enumName + "[" + memberName + "] = " + initializer + "] = " + memberName + ';';
                edits.push({pos: node.members[i].pos, end: end, afterEnd: textToPaste});
            }
        }
        if (node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent) && hasExportModifier(node)) {
            textToPaste = "let " + enumName + ";(function (" + enumName + ")";
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.name.end, afterEnd: textToPaste});
            let moduleName = node.parent.parent.name.getText();
            textToPaste = ")(" + enumName + " = " + moduleName + "." + enumName + " || (" + moduleName + "." + enumName + " = {}));";
        } else {
            textToPaste = "var " + enumName + ";(function (" + enumName + ")";
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.name.end, afterEnd: textToPaste});
            textToPaste = ")(" + enumName + " || (" + enumName + " = {}));";
        }

        edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
    }

    function hasParametersDecorators(node) {
        if (node.parameters && node.parameters.length > 0) {
            return node.parameters.some(function (param) {
                if (param.decorators && param.decorators.length > 0) {
                    return true
                }
            });
        }
    }

    function hasExportModifier(node) {
        if (node.modifiers && node.modifiers.length > 0) {
            return node.modifiers.some(function (el) {
                if (el.kind == ts.SyntaxKind.ExportKeyword) {
                    edits.push({pos: el.pos + el.getLeadingTriviaWidth(), end: el.end});
                    return true
                }
            });
        }
    }

    function transformExportFunction(node) {
        let moduleName = getModuleName(node);
        var constructionName, dotPropertyName;
        if (hasDefaultModifier(node)) {
            if (!node.name) {
                defaultCounter++;
                constructionName = "default_" + defaultCounter;
                edits.push({
                    pos: node.parameters.pos - 1,
                    end: node.parameters.pos - 1,
                    afterEnd: constructionName
                });
            } else {
                constructionName = node.name.getText();
            }
            dotPropertyName = "default";
        } else {
            constructionName = node.name.getText();
            dotPropertyName = constructionName;
        }
        let textToPaste = moduleName + "." + dotPropertyName + " = " + constructionName + ";";
        edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
    }

    function transformExportClass(node) {
        let moduleName = getModuleName(node);
        var constructionName, dotPropertyName;
        if (hasDefaultModifier(node)) {
            if (!node.name) {
                defaultCounter++;
                constructionName = "default_" + defaultCounter;
                edits.push({
                    pos: node.members.pos - 1,
                    end: node.members.pos - 1,
                    afterEnd: constructionName
                });
            } else {
                constructionName = node.name.getText();
            }
            dotPropertyName = "default";
        } else {
            constructionName = node.name.getText();
            dotPropertyName = constructionName;
        }
        let textToPaste = moduleName + "." + dotPropertyName + " = " + constructionName + ";";
        edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
    }

    function transformExportVariable(node) {
        if (node.declarationList && node.declarationList.declarations) {
            let moduleName = getModuleName(node);
            var i = 0;
            while (i < node.declarationList.declarations.length) {
                if (node.declarationList.declarations[i].pos >= node.pos && node.declarationList.declarations[i].pos <= node.end)
                    break;
                i++;
            }
            let stopCommentPos = node.declarationList.declarations[i].pos +
                node.declarationList.declarations[i].getLeadingTriviaWidth();
            let textToPaste = moduleName + ".";
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: stopCommentPos,
                afterEnd: textToPaste
            });
        }
    }

    function isInsideModule(node) {
        return (node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent));
    }
    
    function getModuleName(node) {
        return isInsideModule(node)?node.parent.parent.name.getText():"exports";
    }

    if (exportExists) {
        edits.push({
            pos: 0,
            end: 0,
            afterEnd: "Object.defineProperty(exports, \"__esModule\", { value: true });"
        });
    }

    return edits;
}

function applyEditsToFile(filename, edits) {
    var start = fs.readFileSync(filename, "utf8");
    start = start.replace(/^\uFEFF/, '');
    var end = applyEdits(start, (process.argv[3] == "-d"), edits);
    fs.writeFileSync(filename, end);
}

function applyEdits(code, remove, edits) {
    var start = code;
    var end = "";
    edits.sort((a, b) => b.end - a.end);

    for (var i = 1; i < edits.length; i++) {
        for (var j = i - 1; j >= 0; j--) {
            if (edits[j + 1].pos >= edits[j].pos && edits[j + 1].end <= edits[j].end) {
                if (edits[j + 1].pos === edits[j].pos && edits[j + 1].end === edits[j].end) {
                    edits[j].afterEnd += edits[j + 1].afterEnd;
                }
                edits.splice(j + 1, 1);
                i--;
            }
        }
    }

    edits.forEach(edit => {
        let afterEnd = (edit.afterEnd) ? edit.afterEnd : "";
        if (edit.pos === edit.end) {
            end = afterEnd + start.slice(edit.end) + end;
        } else {
            let piece = start.slice(edit.pos, edit.end).replace(/\*\//g, "  ");
            if (remove && !/\n/.test(piece)) {
                end = afterEnd + start.slice(edit.end) + end;
            } else {
                end = "/*" + start.slice(edit.pos, edit.end).replace(/\*\//g, "  ") + "*/" + afterEnd + start.slice(edit.end) + end;
            }
        }
        start = start.slice(0, edit.pos)
    });
    end = start + end;
    return end;
}

var transpileTypescriptCode = function transpileTypescriptCode(code, options, remove) {
    let edits = deTypescript(['transpile-dummy.ts'], options, code);
    return applyEdits(code, remove, edits);
};
exports.transpileTypescriptCode = transpileTypescriptCode;

if (process.argv.length > 2) {
    generateJavaScriptFile(process.argv.slice(2), {
        target: ts.ScriptTarget.ES5, module: "None", allowJs: false, lib: [], types: [], noEmit: true
    });
}

