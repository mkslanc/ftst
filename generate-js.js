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
    var refParents = [];
    var defaultCounter = 0;
    var exportExists = false;
    var moduleExportExists = false;
    var moduleReferencesNames = {};
    var modulesIdentifiers = {};
    var textToPaste;

    for (var _i = 0, _a = program.getSourceFiles(); _i < _a.length; _i++) {
        var sourceFile = _a[_i];
        if (!sourceFile.isDeclarationFile) {
            ts.forEachChild(sourceFile, visit);
        }
    }

    function visit(node) {
        switch (true) {
            case (ts.isIdentifier(node)):
                let symbol2 = checker.getSymbolAtLocation(node);
                if (symbol2 && !isTheSameStatement(node, symbol2)) {
                    textToPaste = findReferencedDeclaration(symbol2);

                    if (textToPaste && textToPaste.afterEnd != "var " && textToPaste.afterEnd != "const " && !isAlreadyReferenced(node, textToPaste.afterEnd)) {
                        edits.push({
                            pos: node.pos + node.getLeadingTriviaWidth(),
                            end: node.pos + node.getLeadingTriviaWidth(),
                            afterEnd: textToPaste.afterEnd
                        });
                    }
                }
                break;
            case (ts.isExportAssignment(node)):
                if (node.isExportEquals && node.isExportEquals == true) {
                    let symbol = checker.getSymbolAtLocation(node.expression);
                    if (symbol && symbol.valueDeclaration) {
                        //single module export allowed
                        if (moduleExportExists === true) {
                            edits.push({
                                pos: node.pos + node.getLeadingTriviaWidth(),
                                end: node.end
                            });
                        } else {
                            moduleExportExists = true;
                            edits.push({
                                pos: node.pos + node.getLeadingTriviaWidth(),
                                end: node.pos + node.getLeadingTriviaWidth(),
                                afterEnd: "module."
                            });
                            edits.push({
                                pos: node.pos + node.getLeadingTriviaWidth() + 6,
                                end: node.pos + node.getLeadingTriviaWidth() + 6, afterEnd: "s"
                            });
                        }
                    } else {
                        edits.push({
                            pos: node.pos + node.getLeadingTriviaWidth(),
                            end: node.end
                        });
                    }
                } else {
                    exportExists = true;
                    edits.push({
                        pos: node.pos + node.getLeadingTriviaWidth() + 6,
                        end: node.pos + node.getLeadingTriviaWidth() + 7,
                        afterEnd: "s."
                    });
                    edits.push({pos: node.expression.pos, end: node.expression.pos, afterEnd: " ="});
                }
                break;
            case ts.isTypeAliasDeclaration(node):
            case ts.isInterfaceDeclaration(node):
            case (ts.isFunctionDeclaration(node) && !node.body):
            case (ts.isMethodDeclaration(node) && !node.body):
            case (node.kind && node.kind == ts.SyntaxKind.PrivateKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.PublicKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.ProtectedKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.ReadonlyKeyword):
            case (node.kind && node.kind == ts.SyntaxKind.AbstractKeyword):
            case ((ts.isGetAccessor(node) || ts.isSetAccessor(node)) && !node.body):
            case (node.kind && node.kind == ts.SyntaxKind.Constructor && !node.body):
            case (ts.isHeritageClause(node) && node.token && node.token == ts.SyntaxKind.ImplementsKeyword):
                //TODO: maybe i will find better way to exclude overloads for functions and class methods
                edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                return;
            case (hasDeclareModifier(node)):
                edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                return;
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
            case (node.body && ts.isModuleDeclaration(node) && !hasDeclareModifier(node)):
                //TODO: maybe need some checks for crazy stuff like abstract namespace Example etc
                transformModule(node);
                break;
            case (ts.isEnumDeclaration(node) && !hasDeclareModifier(node)):
                transformEnum(node);
                return;
            case (ts.isFunctionDeclaration(node) && hasExportModifier(node)):
                transformExportFunction(node);
                break;
            case (ts.isVariableStatement(node) && hasExportModifier(node)):
                transformExportVariable(node);
                break;
            case (ts.isImportEqualsDeclaration(node)):
                var textToPaste;
                if (node.moduleReference && ts.isExternalModuleReference(node.moduleReference)) {
                    exportExists = true;
                    if (hasExportModifier(node)) {
                        textToPaste = getModuleName(node) + '.';
                    } else {
                        textToPaste = 'const ';
                    }
                } else {
                    if (hasExportModifier(node)) {
                        textToPaste = getModuleName(node) + '.';
                    } else {
                        textToPaste = 'var '
                    }
                }
                refParents.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    afterEnd: textToPaste
                });
                edits.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: node.name.pos + 1,
                    afterEnd: textToPaste
                });
                break;
            case (ts.isImportDeclaration(node)):
                var moduleReferenceName = getModuleSpecifierName(node);
                if (moduleReferenceName != undefined) {
                    exportExists = true;
                    if (node.importClause && node.importClause.namedBindings && node.importClause.namedBindings.name) {
                        moduleReferenceName = node.importClause.namedBindings.name.getText();
                        textToPaste = "const " + moduleReferenceName + " = require(\"" + node.moduleSpecifier.text + "\");";
                    } else {
                        if (!moduleReferencesNames[moduleReferenceName]) {
                            moduleReferencesNames[moduleReferenceName] = 0;
                        }
                        moduleReferencesNames[moduleReferenceName]++;
                        textToPaste = "const " + moduleReferenceName + "_" + moduleReferencesNames[moduleReferenceName] + " = require(\"" + node.moduleSpecifier.text + "\");";
                    }
                    setImportedIdentifiers(node, moduleReferenceName);
                    edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end, afterEnd: textToPaste});
                }
                break;
            case (ts.isExportDeclaration(node)):
                //TODO: need to test with import declaration
                exportExists = true;
                if (node.exportClause && node.exportClause.elements && node.exportClause.elements.length > 0) {
                    var moduleReferenceName = getModuleSpecifierName(node);
                    if (moduleReferenceName != undefined) {
                        if (!moduleReferencesNames[moduleReferenceName]) {
                            moduleReferencesNames[moduleReferenceName] = 0;
                        }
                        moduleReferencesNames[moduleReferenceName]++;
                        setExportedIdentifiers(node, moduleReferenceName);
                        textToPaste = "var " + moduleReferenceName + "_" + moduleReferencesNames[moduleReferenceName] + " = require(\"" + node.moduleSpecifier.text + "\");";
                        edits.push({
                            pos: node.pos + node.getLeadingTriviaWidth(),
                            end: node.end,
                            afterEnd: textToPaste
                        });
                    } else {//TODO: checker.getSymbolAtLocation(node.exportClause.elements[0].propertyName)
                        setExportedIdentifiers(node);
                        edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                    }
                } else {
                    edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                }
                break;
            case (ts.isClassDeclaration(node)):
                if (node.decorators && node.decorators.length) {
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
                }
                if (hasExportModifier(node)) {
                    transformExportClass(node);
                }
                if (hasExtendsHeritage(node)) {
                    addMissedSuper(node);
                }
                break;
            case (node.kind === ts.SyntaxKind.Constructor && node.parameters && node.parameters.length > 0):
                if (node.body) {
                    let parameterPos = getPositionForParameters(node.body);
                    node.parameters.forEach(function (param) {
                        if (hasControllingAccessModifier(param)) {
                            textToPaste = "this." + param.name.getText() + " = " + param.name.getText() + ";";
                            edits.push({
                                pos: parameterPos,
                                end: parameterPos,
                                afterEnd: textToPaste
                            });
                        }
                    });
                }
                break;
        }
        commentOutTypes(node);
        ts.forEachChild(node, visit);
    }

    function hasExtendsHeritage(node) {
        return node.heritageClauses && node.heritageClauses.some(function (el) {
            return (el.token && el.token == ts.SyntaxKind.ExtendsKeyword);
        });
    }

    function addMissedSuper(node) {
        if (node.members && node.members.length > 0) {
            let constructorNode = getConstructor(node);
            if (constructorNode) {
                if (constructorNode.body) {
                    let superKey = hasSuperKeyword(constructorNode.body);
                    if (!superKey) {
                        edits.push({
                            pos: constructorNode.body.statements.pos,
                            end: constructorNode.body.statements.pos,
                            afterEnd: "super(...arguments);"
                        });
                    }
                }
            }
        }
    }

    function getConstructor(node) {
        return node.members.find(function (el) {
            if (el.kind === ts.SyntaxKind.Constructor) {
                return el;
            }
        })
    }

    function getPositionForParameters(node) {
        let superKey = hasSuperKeyword(node);
        if (superKey)
            return superKey.end;
        return node.pos + node.getLeadingTriviaWidth() + 1;
    }

    function hasSuperKeyword(node) {
        if (node.statements && node.statements.length > 0) {
            return node.statements.find(function (el) {
                if (el.expression && el.expression.expression && el.expression.expression.kind === ts.SyntaxKind.SuperKeyword) {
                    return el;
                }
            });
        }
    }

    function isAlreadyReferenced(node, parentText) {
        //TODO: bad code, need to improve in future
        let parent = node.parent.getText();
        return parent.search(parentText + node.getText()) > -1;
    }

    function isTheSameStatement(node, symbol) {
        return symbol.declarations && symbol.declarations.some(function (el) {
            return (el.name && node.pos === el.name.pos && node.end === el.name.end)
        });
    }

    function findReferencedDeclaration(symbol) {
        if (symbol.declarations) {
            for (var i = 0; i < symbol.declarations.length; i++) {
                let transform = findReferencedTransform(symbol.declarations[i].pos + symbol.declarations[i].getLeadingTriviaWidth());
                if (transform) {
                    return transform;
                }
            }
        }
    }

    function isDuplicatedDeclaration(node) {
        var currentSymbol;
        if (node.localSymbol && node.localSymbol.declarations.length > 0) {
            currentSymbol = node.localSymbol;
        } else if (node.symbol && node.symbol.declarations.length > 1) {
            currentSymbol = node.symbol;
        }
        if (currentSymbol) {
            let index = currentSymbol.declarations.findIndex(function (el, index) {
                if (node.pos === el.pos && node.end === el.end) {
                    return index;
                }
            });
            let duplCounter = index;
            for (var i = 0; i < index; i++) {
                if (isExcludedFromSource(currentSymbol.declarations[i])) {
                    duplCounter--;
                }
            }
            if (duplCounter > 0)
                return true;
        }
    }

    function setImportedIdentifiers(node, moduleName) {
        if (node.importClause && node.importClause.namedBindings && node.importClause.namedBindings.elements && node.importClause.namedBindings.elements.length > 0){
            node.importClause.namedBindings.elements.forEach(function (el) {
                let elName = el.name.getText();
                /*if (!modulesIdentifiers[elName]) {
                    modulesIdentifiers[elName] = moduleName;
                }*/
                refParents.push({
                    pos: el.pos + el.getLeadingTriviaWidth(),
                    afterEnd: moduleName + "_" + moduleReferencesNames[moduleName] + ".",
                });
            });
        } else {
            if (node.importClause && node.importClause.name) {
                let elName = node.importClause.getText();
                /*if (!modulesIdentifiers[elName]) {
                    modulesIdentifiers[elName] = moduleName;
                }*/
            }
        }
    }

    function setExportedIdentifiers(node, moduleName) {
        node.exportClause.elements.forEach(function (el) {
            let elPropertyName = (el.propertyName) ? el.propertyName.getText() : el.name.getText();
            let elName = el.name.getText();
            let text;
            if (moduleName) {
                /*if (!modulesIdentifiers[elName]) {
                    modulesIdentifiers[elName] = moduleName;
                }*/
                text = "exports." + elName + " = " + getComposedReferenceName(moduleName) + elPropertyName + ";";
            } else {
                text = "exports." + elName + " = " + elPropertyName + ";";
            }
            edits.push({pos: node.end, end: node.end, afterEnd: text});
        });
    }

    function isImportedIdentifier(node) {
        return !!(modulesIdentifiers[node.getText()]);
    }

    function getComposedReferenceName(moduleName) {
        return moduleName + "_" + moduleReferencesNames[moduleName] + ".";
    }

    function commentOutTypes(node) {
        if (node.type) {//TODO: super type arguments which is not parsed in node tree
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

    function hasDeclareModifier(node, commentOut = false) {
        if (node.modifiers && node.modifiers.length > 0) {
            return node.modifiers.some(function (el) {
                if (el.kind == ts.SyntaxKind.DeclareKeyword) {
                    if (commentOut === true) {
                        edits.push({pos: el.pos + el.getLeadingTriviaWidth(), end: el.end});
                    }
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

    function transformModule(node) {
        let moduleName = node.name.getText();
        if (node.body.statements && node.body.statements.length > 0) {
            if (hasExportModifier(node)) {
                let parentModuleName = getModuleName(node);
                textToPaste = isDuplicatedDeclaration(node) ?
                    "(function (" + moduleName + ")" :
                    (parentModuleName != "exports") ?
                        "let " + moduleName + ";(function (" + moduleName + ")" :
                        "var " + moduleName + ";(function (" + moduleName + ")";
                edits.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: node.body.pos,
                    afterEnd: textToPaste
                });
                textToPaste = ")(" + moduleName + " = " + parentModuleName + "." + moduleName + " || (" + parentModuleName + "." + moduleName + " = {}));";
            } else {
                textToPaste = isDuplicatedDeclaration(node) ?
                    "(function (" + moduleName + ")" :
                    (isInsideModule(node)) ?
                        "let " + moduleName + ";(function (" + moduleName + ")" :
                        "var " + moduleName + ";(function (" + moduleName + ")";
                edits.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: node.body.pos,
                    afterEnd: textToPaste
                });
                textToPaste = ")(" + moduleName + " || (" + moduleName + " = {}));";
            }
            edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
        } else {
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
        }
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
        if (hasExportModifier(node)) {
            let moduleName = getModuleName(node);
            textToPaste = isDuplicatedDeclaration(node) ?
                "(function (" + enumName + ")" :
                (moduleName != "exports") ?
                    "let " + enumName + ";(function (" + enumName + ")" :
                    "var " + enumName + ";(function (" + enumName + ")";
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.name.end, afterEnd: textToPaste});
            textToPaste = ")(" + enumName + " = " + moduleName + "." + enumName + " || (" + moduleName + "." + enumName + " = {}));";
        } else {
            textToPaste = isDuplicatedDeclaration(node) ?
                "(function (" + enumName + ")" :
                (isInsideModule(node)) ?
                    "let " + enumName + ";(function (" + enumName + ")" :
                    "var " + enumName + ";(function (" + enumName + ")";
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

    function hasImportSpecifierDeclaration(node) {
        if (node.declarations && node.declarations.length > 0) {
            return node.declarations.every(function (el) {
                if (ts.isImportSpecifier(el) || ts.isImportClause(el)) {
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

    function hasControllingAccessModifier(node) {
        if (node.modifiers && node.modifiers.length > 0) {
            return node.modifiers.some(function (el) {
                if (el.kind == ts.SyntaxKind.PrivateKeyword || el.kind == ts.SyntaxKind.PublicKeyword || el.kind == ts.SyntaxKind.ProtectedKeyword || el.kind == ts.SyntaxKind.ReadonlyKeyword) {
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
        if (hasDefaultModifier(node) || !node.name) {
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
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.declarationList.declarations[0].pos
            });
            node.declarationList.declarations.forEach(function (decl) {
                let textToPaste = moduleName + ".";
                refParents.push({
                    pos: decl.pos + decl.getLeadingTriviaWidth(),
                    afterEnd: textToPaste,
                });
                edits.push({
                    pos: decl.pos + decl.getLeadingTriviaWidth(),
                    end: decl.pos + decl.getLeadingTriviaWidth(),
                    afterEnd: textToPaste
                });
            });
        }
    }

    function isInsideModule(node) {
        return (node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent));
    }

    function getModuleName(node) {
        if (isInsideModule(node)) {
            return node.parent.parent.name.getText();
        } else {
            exportExists = true;
            return "exports";
        }
    }

    function getModuleSpecifierName(node) {
        if (node.moduleSpecifier) {
            var moduleName = node.moduleSpecifier.text;
            if (moduleName != undefined) {
                let namePart = moduleName.split('/');
                let modName = namePart[namePart.length - 1];
                return (/[^a-zA-Z]/.test(modName[0])) ? "_" + modName : modName;
            }
        }
    }

    function findReferencedTransform(endPos) {
        return refParents.find(function (el) {
            return (el.pos === endPos)
        });
    }

    function isExcludedFromSource(node) {
        return edits.some(function (el) {
            if (el.pos == node.pos + node.getLeadingTriviaWidth() && el.end == node.end) {
                return true;
            }
        });
    }

    if (exportExists && !moduleExportExists) {
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
                if (edits[j + 1].pos != 0 && edits[j + 1].end != 0) {
                    edits.splice(j + 1, 1);
                    i--;
                }
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

