"use strict";
var ts = require("typescript");
var fs = require("fs");
var utilities = require("./utilities-ts");

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
        if (stat.isFile() && /([^d]|[^.]d)\.ts$/.test(path)) {
            var fileArr = [];
            fileArr.push(path);
            var filename = path.replace(/.ts$/, "Js.js");
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
    var exportWrapperExists = false;
    var moduleReferencesNames = {};
    var modulesIdentifiers = {};
    var textToPaste;
    var fileNameRegExp = new RegExp(fileNames[0]);

    for (var _i = 0, _a = program.getSourceFiles(); _i < _a.length; _i++) {
        var sourceFile = _a[_i];
        if (!sourceFile.isDeclarationFile && fileNameRegExp.test(sourceFile.fileName)) {
            ts.forEachChild(sourceFile, visit);
        }
    }

    function getTextFromSourceFile(pos, end) {
        return sourceFile.getFullText().slice(pos, end);
    }

    function visit(node) {
        switch (true) {
            case (ts.isIdentifier(node) && !ts.isTypeReferenceNode(node.parent) && !ts.isTypeQueryNode(node.parent)):
                transformReferencedIdentifier(node);
                break;
            case (ts.isExportAssignment(node)):
                transformExportAssignment(node);
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
            case (hasDeclareModifier(node)):
            case (ts.isIndexSignatureDeclaration(node)):
                //TODO: maybe i will find better way to exclude overloads for functions and class methods
                edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
                return;
            case (ts.isParameter(node) && node.name && node.name.getText() == "this"):
                commentOutThisFromParameters(node);
                return;
            case (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)):
                transformClassElements(node);
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
                transformImportEqualsDeclaration(node);
                break;
            case (ts.isImportDeclaration(node)):
                transformImportDeclaration(node);
                break;
            case (ts.isExportDeclaration(node)):
                transformExportDeclaration(node);
                break;
            case (ts.isClassDeclaration(node)):
                transformClass(node);
                break;
            case (node.kind === ts.SyntaxKind.Constructor):
                transformConstructor(node);
                break;
            case ts.isArrowFunction(node):
                normalizeBracketsInArrowFunction(node);
                break;
            case (node.kind === ts.SyntaxKind.ImportKeyword && ts.isCallExpression(node.parent)):
                transformDynamicImport(node);
                break;
            case (ts.isNonNullExpression(node)):
                commentOutNonNullExpression(node);
                break;
        }
        commentOutTypes(node);
        ts.forEachChild(node, visit);
    }

    function commentOutNonNullExpression(node) {
        edits.push({
            pos: node.end - 1,
            end: node.end
        });
    }

    function transformDynamicImport(node) {
        edits.push({
            pos: node.pos + node.getLeadingTriviaWidth(),
            end: node.end,
            afterEnd: "Promise.resolve().then(() => require"
        });
        edits.push({
            pos: node.parent.end,
            end: node.parent.end,
            afterEnd: ")"
        });
    }

    function transformConstructor(node) {
        if (node.decorators) {//decorators for constructors are not allowed
            edits.push({
                pos: node.decorators.pos,
                end: node.decorators.end
            });
        }
        if (node.body && node.parameters && node.parameters.length > 0) {
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
            if (hasParametersDecorators(node) && !node.parent.decorators) {
                classLet(node);
                var className = getClassName(node.parent, true);
                var decorators = ";" + className.constructionName + "= __decorate([";
                decorators += commentOutParametersDecorators(node);
                decorators = decorators.slice(0, -1) + "], " + className.constructionName + ");";
                edits.push({pos: node.parent.end, end: node.parent.end, order: 0, afterEnd: decorators});
            }
        }
    }

    function transformClass(node) {
        var className = getClassName(node);
        if (node.decorators && node.decorators.length) {
            let afterEnd = "let " + className.constructionName + "= ";
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.decorators.end,
                afterEnd: afterEnd
            });
            var decorators = ";" + className.constructionName + "= __decorate([";
            let reference;
            for (var i = 0; i < node.decorators.length; i++) {
                reference = getReferencedIdentifier(node.decorators[i].expression);
                decorators += reference.text + replaceTypeCastInDecorators(node.decorators[i].expression.getText()) + ",";
            }
            //we need this if class has constructors with param decorator
            let constructor = getConstructor(node);
            if (constructor) {
                if (hasParametersDecorators(constructor)) {
                    decorators += commentOutParametersDecorators(constructor);
                }
            }
            decorators = decorators.slice(0, -1) + "], " + className.constructionName + ");";
            edits.push({pos: node.end, end: node.end, order: 1, afterEnd: decorators});
        }
        if (hasExportModifier(node)) {
            transformExportClass(node, className);
        }
        if (hasExtendsHeritage(node)) {
            addMissedSuper(node);
        }
    }

    function transformExportDeclaration(node) {
        exportExists = true;
        if (node.exportClause && node.exportClause.elements && node.exportClause.elements.length > 0) {
            var moduleReferenceName = getModuleSpecifierName(node);
            if (moduleReferenceName != undefined) {
                if (!moduleReferencesNames[moduleReferenceName]) {
                    moduleReferencesNames[moduleReferenceName] = 0;
                }
                moduleReferencesNames[moduleReferenceName]++;
                setExportedIdentifiers(node, getComposedReferenceName(moduleReferenceName));
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
            if (node.moduleSpecifier) {
                exportWrapperExists = true;
                textToPaste = '__export(require(' + node.moduleSpecifier.getText() + "));";
            } else {
                textToPaste = '';
            }
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end, afterEnd: textToPaste});
        }
    }

    function transformImportDeclaration(node) {
        var moduleReferenceName = getModuleSpecifierName(node);
        if (moduleReferenceName != undefined) {
            exportExists = true;
            if (node.importClause) {
                if (node.importClause.name || (node.importClause.namedBindings && node.importClause.namedBindings.elements)) {
                    if (!moduleReferencesNames[moduleReferenceName]) {
                        moduleReferencesNames[moduleReferenceName] = 0;
                    }
                    moduleReferencesNames[moduleReferenceName]++;
                    textToPaste = "const " + moduleReferenceName + "_" + moduleReferencesNames[moduleReferenceName] + " = require(\"" + node.moduleSpecifier.text + "\");";
                    edits.push({
                        pos: node.end,
                        end: node.end,
                        aliasEnd: node.importClause.pos,
                        afterEnd: textToPaste
                    });
                }
                if (node.importClause && node.importClause.namedBindings && node.importClause.namedBindings.name) {
                    let moduleReferenceNameBinding = node.importClause.namedBindings.name.getText();
                    textToPaste = "const " + moduleReferenceNameBinding + " = require(\"" + node.moduleSpecifier.text + "\");";
                    refParents.push({
                        pos: node.importClause.namedBindings.pos + node.importClause.namedBindings.getLeadingTriviaWidth(),
                        aliasEnd: node.importClause.namedBindings.name.pos,
                        afterEnd: "",
                        moduleName: moduleReferenceNameBinding
                    });
                    if (!modulesIdentifiers[moduleReferenceNameBinding]) {
                        modulesIdentifiers[moduleReferenceNameBinding] = moduleReferenceNameBinding;
                    }
                    edits.push({
                        pos: node.end,
                        end: node.end,
                        aliasEnd: node.importClause.namedBindings.name.pos,
                        afterEnd: textToPaste
                    });
                }
            } else {
                textToPaste = "require(\"" + node.moduleSpecifier.text + "\");";
                edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
            }
            setImportedIdentifiers(node, moduleReferenceName);
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.end
            });
        }
    }

    function transformImportEqualsDeclaration(node) {
        var textToPaste;
        if (node.moduleReference) {
            if (ts.isExternalModuleReference(node.moduleReference)) {
                exportExists = true;
                if (hasExportModifier(node)) {
                    textToPaste = getModuleName(node) + '.';
                } else {
                    textToPaste = 'const ';
                }
                refParents.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                    afterEnd: textToPaste
                });
                textToPaste += getTextFromSourceFile(node.name.pos + 1, node.end);
            } else {
                if (hasExportModifier(node)) {
                    textToPaste = getModuleName(node) + '.';
                } else {
                    textToPaste = 'var '
                }
                refParents.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                    afterEnd: textToPaste,
                    used: isDeeplyInsideModule(node)
                });
                let reference = getReferencedIdentifier(node.moduleReference);
                textToPaste += node.name.getText() + " = " + reference.text + getTextFromSourceFile(node.moduleReference.pos + node.moduleReference.getLeadingTriviaWidth() + reference.shift, node.end);
            }
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.end,
                aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                afterEnd: textToPaste
            });
        }
    }

    function getReferencedIdentifier(node) {
        let identifier = node;
        if (ts.isQualifiedName(node)) {
            identifier = node.left;
        }
        if (ts.isCallExpression(node)) {
            identifier = node.expression;
        }
        let symbol = checker.getSymbolAtLocation(identifier);
        if (symbol && !isTheSameStatement(identifier, symbol)) {
            let declaration = findReferencedDeclaration(symbol);
            if (declaration && declaration.afterEnd != "var " && declaration.afterEnd != "const ") {
                let shift = 0;
                if (declaration.replace === true) {
                    shift = getIdentifierLength(identifier);
                }
                return {
                    "text": declaration.afterEnd,
                    "shift": shift
                };
            }
        }
        return {
            "text": "",
            "shift": 0
        };
    }

    function getIdentifierLength(node) {
        return node.getText().length;
    }

    function transformClassElements(node) {
        var className;
        if (hasDefaultModifier(node.parent) && !node.parent.name) {
            className = "default_" + defaultCounter;
        } else {
            if (!node.parent.name)
                return;
            className = node.parent.name.getText();
        }
        var constructionName = getMethodName(node.name);
        if (node.decorators && node.decorators.length) {
            edits.push({pos: node.decorators.pos, end: node.decorators.end});
            var decorators = ";__decorate([";
            let reference;
            for (var i = 0; i < node.decorators.length; i++) {
                reference = getReferencedIdentifier(node.decorators[i].expression);
                decorators += reference.text + replaceTypeCastInDecorators(node.decorators[i].expression.getText()) + ",";
            }
            if (ts.isPropertyDeclaration(node)) {
                decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", void 0);";
            } else {
                if (hasParametersDecorators(node)) {
                    decorators += commentOutParametersDecorators(node);
                }
                decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", null);";
            }
            edits.push({pos: node.parent.end, end: node.parent.end, order: 0, afterEnd: decorators});
        } else {
            if (hasParametersDecorators(node)) {
                var decorators = ";__decorate([";
                decorators += commentOutParametersDecorators(node);
                decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", null);";
                edits.push({pos: node.parent.end, end: node.parent.end, order: 0, afterEnd: decorators});
            }
        }
        if (ts.isPropertyDeclaration(node) && !node.initializer && !ts.isPrivateIdentifier(node.name)) {
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
        }
        if (ts.isMethodDeclaration(node) && node.questionToken) {
            edits.push({pos: node.questionToken.pos, end: node.questionToken.end});
        }
    }

    function replaceTypeCastInDecorators(text) {
        return text.replace(/\sas\s[^,]+(?=[,)])/g, "");
    }

    function transformReferencedIdentifier(node) {
        let symbol2 = checker.getSymbolAtLocation(node);
        if (symbol2 && !isTheSameStatement(node, symbol2)) {
            let textToPaste = findReferencedDeclaration(symbol2);

            if (textToPaste && textToPaste.afterEnd != "var " && textToPaste.afterEnd != "const " && !isAlreadyReferenced(node, textToPaste.afterEnd)) {
                edits.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: (textToPaste.replace) ? node.end : node.pos + node.getLeadingTriviaWidth(),
                    afterEnd: textToPaste.afterEnd
                });
            }
        }
    }

    function transformExportAssignment(node) {
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
    }

    function commentOutThisFromParameters(node) {
        var text = getTextFromSourceFile(node.parent.parameters.pos, node.parent.parameters.end);
        let result = text.match(/(,\s*)?(@.+)?this(?:\:[^,]*)?(,)?/);
        if (result[1] && result[2]) {
            edits.push({
                pos: node.parent.parameters.pos + result.index,
                end: node.parent.parameters.pos + result.index + result[0].length - 1
            });
        } else {
            edits.push({
                pos: node.parent.parameters.pos + result.index,
                end: node.parent.parameters.pos + result.index + result[0].length
            });
        }
    }

    function getMethodName(node) {
        if (ts.isComputedPropertyName(node)) {
            return node.expression.getText().replace(/"/g, "");
        } else {
            return node.getText();
        }
    }

    function normalizeBracketsInArrowFunction(node) {
        if (node.body && node.body.kind === ts.SyntaxKind.TypeAssertionExpression) {
            let firstToken = node.body.getFirstToken();
            if (firstToken) {
                let lastToken = node.body.getLastToken();
                if (firstToken.kind !== ts.SyntaxKind.OpenParenToken) {
                    edits.push({
                        pos: node.body.pos + node.body.getLeadingTriviaWidth() - 1,
                        end: node.body.pos + node.body.getLeadingTriviaWidth() - 1,
                        afterEnd: "("
                    });
                }
                if (lastToken.kind !== ts.SyntaxKind.CloseParenToken) {
                    edits.push({pos: node.body.end, end: node.body.end, afterEnd: ")"});
                }
            }
        }
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
        if (symbol.valueDeclaration) {//priority for value declaration
            let transform = findReferencedTransformByEndPos(symbol.valueDeclaration.pos + symbol.valueDeclaration.getLeadingTriviaWidth());
            if (transform) {
                transform.used = true;
                return transform;
            }
        } else {
            if (symbol.declarations) {
                for (var i = 0; i < symbol.declarations.length; i++) {
                    let transform = findReferencedTransformByEndPos(symbol.declarations[i].pos + symbol.declarations[i].getLeadingTriviaWidth());
                    if (transform) {
                        transform.used = true;
                        return transform;
                    }
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
        if (node.importClause && node.importClause.namedBindings && node.importClause.namedBindings.elements && node.importClause.namedBindings.elements.length > 0) {
            node.importClause.namedBindings.elements.forEach(function (el) {
                let elName = (el.propertyName) ? el.propertyName.getText() : el.getText();
                if (!modulesIdentifiers[elName]) {
                    modulesIdentifiers[elName] = moduleName + "_" + moduleReferencesNames[moduleName];
                }
                if (el.propertyName) {
                    refParents.push({
                        pos: el.pos + el.getLeadingTriviaWidth(),
                        aliasEnd: node.importClause.pos,
                        afterEnd: moduleName + "_" + moduleReferencesNames[moduleName] + "." + el.propertyName.getText(),
                        replace: true,
                        moduleName: moduleName + "_" + moduleReferencesNames[moduleName]
                    });
                } else {
                    refParents.push({
                        pos: el.pos + el.getLeadingTriviaWidth(),
                        aliasEnd: node.importClause.pos,
                        afterEnd: moduleName + "_" + moduleReferencesNames[moduleName] + ".",
                        moduleName: moduleName + "_" + moduleReferencesNames[moduleName]
                    });
                }
            });
        }
        if (node.importClause && node.importClause.name) {
            let elName = node.importClause.name.getText();
            if (!modulesIdentifiers[elName]) {
                modulesIdentifiers[elName] = moduleName + "_" + moduleReferencesNames[moduleName] + ".default";
            }
            refParents.push({
                pos: node.importClause.name.pos + node.importClause.name.getLeadingTriviaWidth(),
                aliasEnd: node.importClause.name.pos,
                afterEnd: moduleName + "_" + moduleReferencesNames[moduleName] + ".default",
                replace: true,
                moduleName: moduleName + "_" + moduleReferencesNames[moduleName]
            });
        }

    }

    function setExportedIdentifiers(node, moduleName) {
        node.exportClause.elements.forEach(function (el) {
            let elPropertyName = (el.propertyName) ? el.propertyName.getText() : el.name.getText();
            let elName = el.name.getText();
            let text;
            if (isImportedIdentifier(elPropertyName) && !moduleName) {
                moduleName = modulesIdentifiers[elPropertyName];
                let transform = findReferencedTransformByModule(moduleName);
                if (transform) {
                    transform.used = true;
                }
            }
            if (moduleName) {
                let identifier = (/_[\d]+$/.test(moduleName)) ? moduleName + "." + elPropertyName : moduleName;
                text = "exports." + elName + " = " + identifier + ";";
            } else {
                text = "exports." + elName + " = " + elPropertyName + ";";
            }
            edits.push({pos: node.end, end: node.end, afterEnd: text});
        });
    }

    function isImportedIdentifier(name) {
        return !!(modulesIdentifiers.hasOwnProperty(name));
    }

    function getComposedReferenceName(moduleName) {
        return moduleName + "_" + moduleReferencesNames[moduleName];
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
                if (el.kind == ts.SyntaxKind.DefaultKeyword) {
                    edits.push({pos: el.pos + el.getLeadingTriviaWidth(), end: el.end});
                    return true
                }
            });
        }
    }

    function classLet(node) {
        let classParent = findClassParent(node);
        if (classParent) {
            let className = getClassName(classParent, true);
            let classEnd = (classParent.decorators) ? classParent.decorators.end : classParent.pos + classParent.getLeadingTriviaWidth();
            let afterEnd = "let " + className.constructionName + "= ";
            if (!hasTheSameEdit(classParent.pos + classParent.getLeadingTriviaWidth(), classEnd, afterEnd)) {
                edits.push({
                    pos: classParent.pos + classParent.getLeadingTriviaWidth(),
                    end: classEnd,
                    afterEnd: afterEnd
                });
            }
        }
    }

    function commentOutParametersDecorators(node) {
        let decorators = '';
        let thisParam = getThisParameter(node);
        for (var i = 0; i < node.parameters.length; i++) {
            if (node.parameters[i].decorators && node.parameters[i].decorators.length) {
                for (var j = 0; j < node.parameters[i].decorators.length; j++) {
                    edits.push({
                        pos: node.parameters[i].decorators[j].pos,
                        end: node.parameters[i].decorators[j].end
                    });
                    let paramNum = (thisParam && thisParam.pos < node.parameters[i].pos) ? i - 1 : i;
                    let reference = getReferencedIdentifier(node.parameters[i].decorators[j].expression);
                    decorators += "__param(" + paramNum + "," + reference.text + replaceTypeCastInDecorators(node.parameters[i].decorators[j].expression.getText()) + "),";
                }
            }
        }

        return decorators;
    }

    function transformModule(node) {
        let moduleName = node.name.getText();
        let nestedModule = node;
        while (nestedModule.body.name) {
            nestedModule = nestedModule.body;
        }
        if (nestedModule.body.statements && nestedModule.body.statements.length > 0 && !areNonEmitStatements(nestedModule.body.statements)) {
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
                if (isDottedModule(node)) {
                    let parentModuleName = node.parent.name.getText();
                    textToPaste = "{var " + moduleName + ";(function (" + moduleName + ")";
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
            }
            if (edits[edits.length - 2] && edits[edits.length - 2].pos == node.end && edits[edits.length - 2].end == node.end) {
                edits.push({
                    pos: node.end,
                    end: node.end,
                    afterEnd: textToPaste + '}' + edits[edits.length - 2].afterEnd
                });
                edits[edits.length - 3].afterEnd = '';
            } else {
                edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
            }
        } else {
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.end});
        }
    }

    function areNonEmitStatements(statements) {
        return statements.every(function (statement) {
            return (ts.isInterfaceDeclaration(statement));
        })
    }

    function transformEnum(node) {
        let enumName = node.name.getText();
        let textToPaste, initializer, computed = false;
        var enumMemberTransform = [];
        if (node.members && node.members.length > 0) {
            initializer = 0;
            for (var i = 0; i < node.members.length; i++) {
                computed = false;
                if (node.members[i].initializer) {
                    if (node.members[i].initializer.kind == ts.SyntaxKind.ThisKeyword) {
                        initializer = "this";
                    } else {
                        initializer = checker.getConstantValue(node.members[i]);
                        if (initializer == undefined) {
                            evaluateBinaryExpression(node.members[i].initializer);
                            let currentText = node.members[i].initializer.getText();

                            enumMemberTransform.forEach(function (el) {
                                let regExp = new RegExp("([^.\w]|^)(" + el + ")([^.\w]|$)");
                                currentText = currentText.replace(regExp, "$1" + enumName + "." + el + "$3");
                            });

                            initializer = currentText;
                            enumMemberTransform = [];
                            computed = true;
                        }
                    }
                } else {
                    if (i != 0) {
                        let typeOfEnumMemberInitializer = typeof checker.getConstantValue(node.members[i - 1]);
                        if (typeOfEnumMemberInitializer === "number") {
                            if (node.members[i - 1].initializer) {
                                initializer = checker.getConstantValue(node.members[i - 1]) + 1;
                                if (initializer == undefined) {
                                    initializer = parseInt(node.members[i - 1].initializer.getText()) + 1;
                                }
                            } else {
                                initializer++;
                            }
                        } else {
                            initializer = undefined;
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
                let memberName = (/^"(.)+"$/.test(node.members[i].name.text) || ts.isNumericLiteral(node.members[i].name)) ? node.members[i].name.text : (node.members[i].name.text) ? '"' + node.members[i].name.text.replace(/"/g, '\\"') + '"' : node.members[i].name.getText();
                if (typeof initializer === "string" && !computed) {
                    textToPaste = enumName + "[" + memberName + "] = \"" + initializer + "\";";
                } else {
                    if (initializer === undefined) {
                        textToPaste = enumName + "[" + enumName + "[" + memberName + "] = void 0] = " + memberName + ';';
                    } else {
                        textToPaste = enumName + "[" + enumName + "[" + memberName + "] = " + initializer + "] = " + memberName + ';';
                    }
                }
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
                (isInsideModule(node) || isInsideFunction(node)) ?
                    "let " + enumName + ";(function (" + enumName + ")" :
                    "var " + enumName + ";(function (" + enumName + ")";
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.name.end, afterEnd: textToPaste});
            textToPaste = ")(" + enumName + " || (" + enumName + " = {}));";
        }
        edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});

        function evaluateBinaryExpression(expr) {
            switch (expr.kind) {
                case ts.SyntaxKind.BinaryExpression:
                    evaluateBinaryExpression(expr.left);
                    evaluateBinaryExpression(expr.right);
                    break;
                case ts.SyntaxKind.Identifier:
                    var identifier = expr;
                    let symbol2 = checker.getSymbolAtLocation(identifier);
                    if (symbol2 && !isTheSameStatement(identifier, symbol2)) {
                        if (symbol2.valueDeclaration && symbol2.parent && symbol2.parent.valueDeclaration && symbol2.parent.valueDeclaration === node) {
                            enumMemberTransform.push(identifier.getText());
                        }
                    }
                    break;
            }
        }
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

    function getThisParameter(node) {
        if (node.parameters && node.parameters.length > 0) {
            return node.parameters.find(function (param) {
                if (param.name && param.name.getText() == "this") {
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
                constructionName = " default_" + defaultCounter;
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

    function transformExportClass(node, className) {
        let moduleName = getModuleName(node);
        var constructionName = className.constructionName, dotPropertyName = className.dotPropertyName;
        let textToPaste = ";" + moduleName + "." + dotPropertyName + " = " + constructionName + ";";
        edits.push({pos: node.end, end: node.end, order: 2, afterEnd: textToPaste});
    }

    function getClassName(node, reusing = false) {
        var constructionName, dotPropertyName;
        if (hasDefaultModifier(node) || !node.name) {
            if (!node.name) {
                if (!reusing)
                    defaultCounter++;
                constructionName = "default_" + defaultCounter;
                if (!node.decorators) {
                    edits.push({
                        pos: (node.heritageClauses) ? node.heritageClauses.pos + 1 : node.members.pos - 1,
                        end: (node.heritageClauses) ? node.heritageClauses.pos + 1 : node.members.pos - 1,
                        afterEnd: constructionName + " "
                    });
                }
            } else {
                constructionName = node.name.getText();
            }
            dotPropertyName = "default";
        } else {
            constructionName = node.name.getText();
            dotPropertyName = constructionName;
        }
        return {constructionName: constructionName, dotPropertyName: dotPropertyName}
    }

    function transformExportVariable(node) {
        if (node.declarationList && node.declarationList.declarations) {
            let moduleName = getModuleName(node);
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.declarationList.declarations[0].pos
            });
            node.declarationList.declarations.forEach(function (decl) {
                if (decl.initializer) {
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
                } else {
                    edits.push({
                        pos: decl.pos + decl.getLeadingTriviaWidth(),
                        end: decl.end + 1
                    });
                }
            });
        }
    }

    function isDottedModule(node) {
        return (node.parent && ts.isModuleDeclaration(node.parent));
    }

    function isInsideModule(node) {
        return (node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent));
    }

    function isDeeplyInsideModule(node) {
        let parent = node;
        while (parent.parent) {
            parent = parent.parent;
            if (ts.isModuleDeclaration(parent))
                return true;
        }
    }

    function findClassParent(node) {
        let parent = node;
        while (parent.parent) {
            parent = parent.parent;
            if (ts.isClassDeclaration(parent))
                return parent;
        }
    }

    function isInsideFunction(node) {
        return (node.parent && node.parent.parent && ts.isFunctionDeclaration(node.parent.parent));
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
                return utilities.makeIdentifierFromModuleName(moduleName);
            }
        }
    }

    function findReferencedTransformByEndPos(endPos) {
        return refParents.find(function (el) {
            return (el.pos === endPos)
        });
    }

    function findReferencedTransformByModule(moduleName) {
        return refParents.find(function (el) {
            return (el.moduleName === moduleName)
        });
    }

    function isExcludedFromSource(node) {
        return edits.some(function (el) {
            if (el.pos == node.pos + node.getLeadingTriviaWidth() && el.end == node.end || ts.isImportSpecifier(node)) {
                return true;
            }
        });
    }

    function hasTheSameEdit(pos, end, afterEnd) {
        return edits.some(function (el) {
            return (el.pos === pos && el.end === end && el.afterEnd === afterEnd)
        })
    }

    function commentOutUnusedDeclarations() {
        refParents.forEach(function (el) {
            let aliasUsed = refParents.some(function (alias) {
                return (alias.moduleName && el.moduleName == alias.moduleName && alias.used);
            });
            if (!el.used && !aliasUsed) {
                let currentEdit = edits.find(function (edit) {
                    return (edit.aliasEnd && edit.aliasEnd == el.aliasEnd);
                });
                if (currentEdit)
                    currentEdit.afterEnd = '';
            }
        });
    }

    commentOutUnusedDeclarations();
    if (exportExists && !moduleExportExists) {
        edits.push({
            pos: 0,
            end: 0,
            afterEnd: "Object.defineProperty(exports, \"__esModule\", { value: true });"
        });
    }
    if (exportWrapperExists) {
        edits.push({
            pos: 0,
            end: 0,
            afterEnd: "function __export(m) { for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];}"
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
    edits.sort((a, b) => b.end - a.end || a.order - b.order);

    for (var i = 1; i < edits.length; i++) {
        for (var j = i - 1; j >= 0; j--) {
            if (edits[j + 1].pos >= edits[j].pos && edits[j + 1].end <= edits[j].end) {
                if (edits[j + 1].pos != 0 && edits[j + 1].end != 0) {
                    if (edits[j + 1].pos === edits[j].pos && edits[j + 1].end === edits[j].end || edits[j].end == edits[j + 1].pos || edits[j + 1].end == edits[j].pos) {
                        if (!edits[j].afterEnd)
                            edits[j].afterEnd = "";
                        if (!edits[j + 1].afterEnd)
                            edits[j + 1].afterEnd = "";
                        edits[j].afterEnd += edits[j + 1].afterEnd;
                    }
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
    end = end.replace(/[;]+/g, ";");//normalize amount of ;
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
