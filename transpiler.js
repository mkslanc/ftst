"use strict";
var ts = require("typescript");
var utilities = require("./utilities-ts");

function createCompilerHost(options, code) {
    return {
        getSourceFile: getSourceFile,
        getDefaultLibFileName: function () {
            return ts.getDefaultLibFileName(options)
        },
        writeFile: function () {
            return "";
        },
        getCurrentDirectory: function () {
            return "";
        },
        getDirectories: function () {
            return [];
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
        directoryExists: function () {
            return true;
        }
    };

    function fileExists() {
        return true;
    }

    function readFile() {
        return "";
    }

    function getSourceFile(fileName) {
        if (!code) {
            var sourceText = ts.sys.readFile(fileName);
        } else {
            var sourceText = code;
        }
        return sourceText !== undefined
            ? ts.createSourceFile(fileName, sourceText, options.target)
            : undefined;
    }
}

function deTypescript(fileNames, options, code) {
    var host = createCompilerHost(options, code);
    if (!Array.isArray(fileNames))
        fileNames = [fileNames];
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
    var startPos = 0;
    var allExports = [];
    var classDecoratorsWrappers = [];
    let syntacticErrors = program.getSyntacticDiagnostics();
    if (syntacticErrors.length === 0) {
        let sources = program.getSourceFiles();
        for (var _i = 0, _a = sources; _i < _a.length; _i++) {
            var sourceFile = _a[_i];
            if (!sourceFile.isDeclarationFile && fileNameRegExp.test(sourceFile.fileName)) {
                if (sourceFile.statements.length > 0) {
                    if (ts.isExpressionStatement(sourceFile.statements[0]) && sourceFile.statements[0].expression.text == "use strict") {
                        startPos = sourceFile.statements[0].end;
                    } else {
                        startPos = sourceFile.statements[0].pos + sourceFile.statements[0].getLeadingTriviaWidth();
                    }
                }
                ts.forEachChild(sourceFile, getReferences);
                ts.forEachChild(sourceFile, visit);
            }
        }
    }

    function getTextFromSourceFile(pos, end, source = sourceFile.getFullText()) {
        return source.slice(pos, end);
    }

    function getReferences(node) {
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
            case ((ts.isGetAccessor(node) || ts.isSetAccessor(node)) && !node.body):
            case (node.kind && node.kind == ts.SyntaxKind.Constructor && !node.body):
            case (ts.isHeritageClause(node) && node.token && node.token == ts.SyntaxKind.ImplementsKeyword):
            case (hasDeclareModifier(node) && !(ts.isVariableStatement(node) && hasExportModifier(node))):
            case (ts.isIndexSignatureDeclaration(node)):
            case (node.kind === ts.SyntaxKind.ExclamationToken):
            case (ts.isParameter(node) && node.name && node.name.getText() == "this"):
            case (ts.isEnumDeclaration(node) && !hasDeclareModifier(node)):
            case (ts.isExportDeclaration(node)):
            case (node.kind === ts.SyntaxKind.ImportKeyword && ts.isCallExpression(node.parent)):
            case ts.isTypeQueryNode(node):
            case (ts.isTypeParameterDeclaration(node)):
            case (ts.isTypeReferenceNode(node)):
                return;
            case (node.body && ts.isModuleDeclaration(node) && !hasDeclareModifier(node)):
                getReferencesFromModule(node);
                break;
            case (ts.isVariableStatement(node) && hasExportModifier(node)):
                transformExportVariable(node);
                break;
            case (ts.isImportDeclaration(node)):
                transformImportDeclaration(node);
                return;
            case (ts.isImportEqualsDeclaration(node)):
                getReferencesFromImportEquals(node);
                return;
            case (ts.isFunctionDeclaration(node) && hasExportModifier(node)):
                transformExportFunction(node);
                break;
            case (ts.isClassDeclaration(node) && hasExportModifier(node)):
                let moduleName = getModuleName(node);
                if (moduleName != "exports") {
                    refParents.push({
                        pos: node.pos + node.getLeadingTriviaWidth(),
                        aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                        afterEnd: moduleName + '.',
                        isExportedClass: true
                    });
                }
                break;
        }
        ts.forEachChild(node, getReferences);
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
            //I don't know why typescript transforms declare identifiers, but here we are
            case (hasDeclareModifier(node) && !(ts.isVariableStatement(node) && hasExportModifier(node))):
            case (ts.isIndexSignatureDeclaration(node)):
            case (node.kind === ts.SyntaxKind.ExclamationToken):
                //TODO: maybe i will find better way to exclude overloads for functions and class methods
                commentOutNode(node);
                return;
            case (node.body && ts.isModuleDeclaration(node) && !hasDeclareModifier(node)):
                transformModule(node);
                break;
            case (ts.isParameter(node) && node.name && node.name.getText() == "this"):
                commentOutThisFromParameters(node);
                return;
            case (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)):
                transformClassElements(node);
                break;
            case (ts.isEnumDeclaration(node) && !hasDeclareModifier(node)):
                transformEnum(node);
                return;
            case (ts.isImportEqualsDeclaration(node)):
                transformImportEqualsDeclaration(node);
                return;
            case (ts.isExportDeclaration(node)):
                transformExportDeclaration(node);
                return;
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
                return;
            case (ts.isNonNullExpression(node)):
                commentOutNonNullExpression(node);
                break;
            case ts.isTypeQueryNode(node):
            case (ts.isTypeParameterDeclaration(node)):
            case (ts.isTypeReferenceNode(node)):
                return;
        }
        commentOutTypes(node);
        ts.forEachChild(node, visit);
    }

    function commentOutNode(node, textToPaste) {
        if (textToPaste) {
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.end,
                afterEnd: textToPaste
            });
        } else {
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.end
            });
        }
    }

    function commentOutNonNullExpression(node, arr = edits) {
        arr.push({
            pos: node.end - 1,
            end: node.end
        });
    }

    function transformDynamicImport(node) {
        commentOutNode(node, "Promise.resolve().then(() => require");
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
                if (hasControllingAccessModifier(param) && !ts.isArrayBindingPattern(param.name) && !ts.isObjectBindingPattern(param.name)) {
                    textToPaste = ";this." + param.name.getText() + " = " + param.name.getText() + ";";
                    edits.push({
                        pos: parameterPos,
                        end: parameterPos,
                        afterEnd: textToPaste
                    });
                }
            });
            if (hasParametersDecorators(node) && !node.parent.decorators) {
                var className = getClassName(node.parent, true);
                var decorators = ";" + className.constructionName + "= __decorate([";
                decorators += commentOutParametersDecorators(node);
                decorators = decorators.slice(0, -1) + "], " + className.constructionName + ");";
                if (!hasClassWrapper(className.constructionName + node.parent.pos)) {
                    edits.push({
                        pos: node.parent.end, end: node.parent.end,
                        order: 2,
                        afterEnd: " return " + className.constructionName + ";})();"
                    });
                    edits.push({
                        pos: node.parent.pos + node.parent.getLeadingTriviaWidth(),
                        end: node.parent.pos + node.parent.getLeadingTriviaWidth(),
                        afterEnd: "let " + className.constructionName + " = (() => { let " + className.constructionName + " = "
                    });
                } else {
                    classLet(node);
                }
                edits.push({pos: node.parent.end, end: node.parent.end, order: 1, afterEnd: decorators});
            }
        }
    }

    function hasClassWrapper(name) {
        if (classDecoratorsWrappers.indexOf(name) === -1) {
            classDecoratorsWrappers.push(name);
            return false;
        }
        return true;
    }

    function transformClass(node) {
        var className = getClassName(node);
        if (node.decorators && node.decorators.length) {
            let afterEnd = "let " + className.constructionName + "= (() => {" + "let " + className.constructionName + " = ";
            //just in case of merged classes?
            hasClassWrapper(className.constructionName + node.pos);
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.decorators.end,
                afterEnd: afterEnd
            });
            var decorators = ";" + className.constructionName + "= __decorate([";
            let decoratorsLength = node.decorators.length;
            for (var i = 0; i < decoratorsLength; i++) {
                decorators += serveDecorators(node.decorators[i].expression) + ",";
            }
            //we need this if class has constructors with param decorator
            let constructor = getConstructor(node);
            if (constructor) {
                if (hasParametersDecorators(constructor)) {
                    decorators += commentOutParametersDecorators(constructor);
                }
            }
            decorators = decorators.slice(0, -1) + "], " + className.constructionName + "); return " + className.constructionName + ";})();";
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
        if (!node.isTypeOnly && !isInsideModule(node)) {
            if (node.exportClause && (node.exportClause.elements && node.exportClause.elements.length > 0 || node.exportClause.name)) {
                if (node.exportClause.elements && node.exportClause.elements.length > 0) {
                    var moduleReferenceName = getModuleSpecifierName(node);
                    if (moduleReferenceName != undefined) {
                        if (!moduleReferencesNames[moduleReferenceName]) {
                            moduleReferencesNames[moduleReferenceName] = 0;
                        }
                        moduleReferencesNames[moduleReferenceName]++;
                        setExportedIdentifiers(node, getComposedReferenceName(moduleReferenceName));
                        textToPaste = "var " + moduleReferenceName + "_" + moduleReferencesNames[moduleReferenceName] + " = require(\"" + node.moduleSpecifier.text + "\");";
                        commentOutNode(node, textToPaste);
                    } else {
                        setExportedIdentifiers(node);
                        commentOutNode(node);
                    }
                }
                if (node.exportClause.name) {
                    let exportName = "exports." + node.exportClause.name.getText();
                    textToPaste = exportName + " = require(" + node.moduleSpecifier.getText() + ");";
                    commentOutNode(node, textToPaste);
                }
            } else {
                if (node.moduleSpecifier && !node.exportClause && !isInsideModule(node)) {
                    exportWrapperExists = true;
                    textToPaste = '__exportStar(require(' + node.moduleSpecifier.getText() + "), exports);";
                } else {
                    textToPaste = '';
                }
                commentOutNode(node, textToPaste);
            }
        } else {
            commentOutNode(node);
        }
    }

    function transformImportDeclaration(node) {
        var moduleReferenceName = getModuleSpecifierName(node);
        if (moduleReferenceName != undefined) {
            exportExists = true;
            if (node.importClause) {
                if (!node.importClause.isTypeOnly) {
                    let nameBindingsExists = node.importClause.namedBindings && node.importClause.namedBindings.elements && node.importClause.namedBindings.elements.length > 0;
                    if (node.importClause.name || nameBindingsExists) {
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
                }
                if (node.importClause.namedBindings && node.importClause.namedBindings.name) {
                    let moduleReferenceNameBinding = node.importClause.namedBindings.name.getText();
                    textToPaste = "const " + moduleReferenceNameBinding + " = require(\"" + node.moduleSpecifier.text + "\");";
                    refParents.push({
                        pos: node.importClause.namedBindings.pos + node.importClause.namedBindings.getLeadingTriviaWidth(),
                        aliasEnd: node.importClause.namedBindings.name.pos,
                        afterEnd: "",
                        moduleName: moduleReferenceNameBinding,
                        varName: moduleReferenceNameBinding,
                        isTypeOnly: (node.importClause.isTypeOnly),
                        isStarImport: true
                    });
                    if (!modulesIdentifiers[moduleReferenceNameBinding]) {
                        modulesIdentifiers[moduleReferenceNameBinding] = moduleReferenceNameBinding;
                    }
                    if (!node.importClause.isTypeOnly) {
                        edits.push({
                            pos: node.end,
                            end: node.end,
                            aliasEnd: node.importClause.namedBindings.name.pos,
                            afterEnd: textToPaste
                        });
                    }
                }
                setImportedIdentifiers(node, moduleReferenceName);
            } else {
                textToPaste = "require(\"" + node.moduleSpecifier.text + "\");";
                edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
                setImportedIdentifiers(node, moduleReferenceName);
            }
            commentOutNode(node);
        }
    }

    function getReferencesFromImportEquals(node) {
        var textToPaste;
        if (node.moduleReference) {
            let varName = node.name.getText();
            if (ts.isExternalModuleReference(node.moduleReference)) {
                let moduleName = utilities.makeIdentifierFromModuleName(node.moduleReference.expression.text);
                if (hasExportModifier(node)) {
                    textToPaste = getModuleName(node) + '.';
                    if (!modulesIdentifiers[varName]) {
                        modulesIdentifiers[varName] = moduleName;
                    }
                } else {
                    textToPaste = 'const ';
                }
                refParents.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                    afterEnd: textToPaste,
                    used: (textToPaste === "exports."),
                    moduleName: "global",
                    isImportEquals: true,
                    varName: varName
                });
            } else {
                let moduleName = "global";
                if (hasExportModifier(node)) {
                    textToPaste = getModuleName(node) + '.';
                    if (!modulesIdentifiers[varName]) {
                        modulesIdentifiers[varName] = moduleName;
                    }
                } else {
                    textToPaste = 'var ';
                }
                if (!isNonEmittedIdentifier(node.moduleReference)) {
                    refParents.push({
                        pos: node.pos + node.getLeadingTriviaWidth(),
                        aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                        afterEnd: textToPaste,
                        moduleName: moduleName,
                        isImportEquals: true,
                        used: hasExportModifier(node),
                        varName: varName
                    });
                }
            }
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
                textToPaste += getTextFromSourceFile(node.name.pos + 1, node.end);
            } else {
                if (!isNonEmittedIdentifier(node.moduleReference)) {
                    if (hasExportModifier(node)) {
                        let moduleName = getModuleName(node);
                        textToPaste = moduleName + '.';
                        if (node.name) {
                            hoistExports(moduleName, textToPaste + node.name.getText());
                        }
                    } else {
                        textToPaste = 'var '
                    }
                    let reference = getReferencedIdentifier(node.moduleReference);
                    textToPaste += node.name.getText() + " = " + reference.text + getTextFromSourceFile(node.moduleReference.pos + node.moduleReference.getLeadingTriviaWidth() + reference.shift, node.end);
                } else {
                    textToPaste = '';
                }

            }
            edits.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                end: node.end,
                aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                afterEnd: textToPaste
            });
        }
    }

    function isNonEmittedIdentifier(expr) {
        var identifier = expr;
        switch (expr.kind) {
            case ts.SyntaxKind.QualifiedName:
                while (identifier.right) {
                    identifier = identifier.right;
                }
            case ts.SyntaxKind.Identifier:
                let symbol = checker.getSymbolAtLocation(identifier);
                if (symbol && symbol.declarations && symbol.declarations.length > 0) {
                    return checkNonEmitDeclarations(symbol);
                }
        }
        return false;
    }

    function checkNonEmitDeclarations(symbol) {
        return symbol.declarations.every(function (declaration) {
            return isNonEmited(declaration);
        });
    }

    function isNonEmited(node) {
        if (ts.isModuleDeclaration(node)) {
            let nestedModule = node;
            while (nestedModule.body.name) {
                nestedModule = nestedModule.body;
            }
            if (nestedModule.body && nestedModule.body.statements) {
                return nestedModule.body.statements.every(function (statement) {
                    return isNonEmited(statement);
                });
            } else {
                return true;
            }
        } else {
            return isNonEmitStatement(node);
        }
    }


    function getReferencedIdentifier(node) {
        let identifier = node;
        if (ts.isCallExpression(node)) {
            identifier = node.expression;
        } else {
            while (ts.isQualifiedName(identifier)) {
                identifier = identifier.left;
            }
        }

        let symbol = checker.getSymbolAtLocation(identifier);
        if (symbol && !isTheSameStatement(identifier, symbol)) {
            let declaration = findReferencedDeclaration(symbol, node);
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
        if (ts.isPropertyDeclaration(node) && !node.initializer && !ts.isPrivateIdentifier(node.name)) {
            commentOutNode(node);
        }
        if (ts.isMethodDeclaration(node) && node.questionToken) {
            commentOutNode(node.questionToken);
        }
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
            if (!ts.isPrivateIdentifier(node.name)) {
                var decorators = ";__decorate([";
                let decoratorsLength = node.decorators.length;
                for (var i = 0; i < decoratorsLength; i++) {
                    decorators += serveDecorators(node.decorators[i].expression) + ",";
                }
                if (ts.isPropertyDeclaration(node)) {
                    decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", void 0);";
                } else {
                    if (hasParametersDecorators(node)) {
                        decorators += commentOutParametersDecorators(node);
                    }
                    decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", null);";
                }
                if (!node.parent.decorators && !hasClassWrapper(className + node.parent.pos)) {
                    edits.push({
                        pos: node.parent.end, end: node.parent.end,
                        order: 2,
                        afterEnd: " return " + className + ";})();"
                    });
                    edits.push({
                        pos: node.parent.pos + node.parent.getLeadingTriviaWidth(),
                        end: node.parent.pos + node.parent.getLeadingTriviaWidth(),
                        afterEnd: "let " + className + " = (() => {",
                        order: 1
                    });
                }
                edits.push({pos: node.parent.end, end: node.parent.end, order: 0, afterEnd: decorators});
            }
        } else {
            if (hasParametersDecorators(node)) {
                if (!node.parent.decorators && !hasClassWrapper(className + node.parent.pos)) {
                    edits.push({
                        pos: node.parent.end, end: node.parent.end,
                        order: 2,
                        afterEnd: " return " + className + ";})();"
                    });
                    edits.push({
                        pos: node.parent.pos + node.parent.getLeadingTriviaWidth(),
                        end: node.parent.pos + node.parent.getLeadingTriviaWidth(),
                        afterEnd: "let " + className + " = (() => {",
                        order: 1,
                    });
                }
                var decorators = ";__decorate([";
                decorators += commentOutParametersDecorators(node);
                decorators = decorators.slice(0, -1) + "], " + className + ".prototype, \"" + constructionName + "\", null);";
                edits.push({pos: node.parent.end, end: node.parent.end, order: 0, afterEnd: decorators});
            }
        }
    }

    function serveDecorators(expression) {
        var localEdits = [];
        if (ts.isCallExpression(expression)) {
            ts.forEachChild(expression, serve);
            localEdits = compensateByPos(localEdits, expression.pos);
            return applyEdits(expression.getText(), true, localEdits);
        } else {
            let reference = getReferencedIdentifier(expression);
            return reference.text + replaceTypeCastInDecorators(expression.getText());
        }

        function serve(node) {
            if (ts.isIdentifier(node)) {
                transformReferencedIdentifier(node, localEdits);
            } else if (ts.isNonNullExpression(node)) {
                commentOutNonNullExpression(node, localEdits);
            }
            commentOutTypes(node, localEdits);
            ts.forEachChild(node, serve);
        }
    }

    function compensateByPos(edits, pos) {
        edits.forEach(function (edit) {
            edit.pos = edit.pos - pos;
            edit.end = edit.end - pos;
        });
        return edits;
    }

    function replaceTypeCastInDecorators(text) {
        return text.replace(/\sas\s[^,]+(?=[,)])/g, "");
    }

    function transformReferencedIdentifier(node, arr = edits) {
        if (ts.isPropertyAccessExpression(node.parent) && node.parent.name.pos === node.pos)
            return;
        let referencedSymbol;
        let isShortHand = ts.isShorthandPropertyAssignment(node.parent);
        if (isShortHand) {
            referencedSymbol = checker.getShorthandAssignmentValueSymbol(node.parent);
        } else {
            let symbol2 = checker.getSymbolAtLocation(node);
            if (symbol2 && !isTheSameStatement(node, symbol2)) {
                referencedSymbol = symbol2;
            }
        }
        if (referencedSymbol) {
            let declaration = findReferencedDeclaration(referencedSymbol, node);
            let declarationExists = declaration && declaration.afterEnd != "var " && declaration.afterEnd != "const " && !isAlreadyReferenced(node, declaration.afterEnd);
            if (declarationExists) {
                let textToPaste;
                if (isShortHand) {
                    textToPaste = node.getText() + ": " + declaration.afterEnd;
                } else if (declaration) {
                    textToPaste = declaration.afterEnd;
                }

                arr.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: (declaration.replace) ? node.end : node.pos + node.getLeadingTriviaWidth(),
                    afterEnd: textToPaste
                });
            }
        }
    }

    function transformExportAssignment(node) {
        if (node.isExportEquals && node.isExportEquals == true) {
            if (ts.isSourceFile(node.parent)) {
                let symbol = checker.getSymbolAtLocation(node.expression);
                if (symbol && symbol.declarations && symbol.declarations.length > 0 && checkNonEmitDeclarations(symbol)) {
                    commentOutNode(node);
                } else {
                    if (!moduleExportExists) {
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
                    } else {
                        commentOutNode(node);
                    }
                }
            }
        } else {
            exportExists = true;
            if (!isNonEmittedIdentifier(node.expression)) {
                edits.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: node.pos + node.getLeadingTriviaWidth() + 7, afterEnd: "exports."
                });
                edits.push({
                    pos: node.expression.pos,
                    end: node.expression.pos, afterEnd: " ="
                });
            } else {
                commentOutNode(node);
            }
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
        if (node.body && node.body.kind === ts.SyntaxKind.TypeAssertionExpression && node.body.expression && ts.isObjectLiteralExpression(node.body.expression)) {
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
        //TODO: unicode names like moduleType\u0031; identifiers with ();
        let parent = node.parent.getText();
        return parent.search(parentText + node.getText()) > -1;
    }

    function isTheSameStatement(node, symbol) {
        return symbol.declarations && symbol.declarations.some(function (el) {
            return (el.name && node.pos === el.name.pos && node.end === el.name.end)
        });
    }

    function findReferencedDeclaration(symbol, node) {
        if (symbol.valueDeclaration) {//priority for value declaration
            let transform = findReferencedTransformByEndPos(symbol.valueDeclaration.pos + symbol.valueDeclaration.getLeadingTriviaWidth());
            if (transform) {
                if (node && (transform.isExportedClass || transform.isExportedFunction) && symbol.parent && symbol.parent.valueDeclaration && isInsideCoords(node, symbol.parent.valueDeclaration))
                    return;
                transform.used = true;
                return transform;
            }
        } else {
            if (symbol.declarations) {
                let declarationsLength = symbol.declarations.length;
                for (var i = 0; i < declarationsLength; i++) {
                    let transform = findReferencedTransformByEndPos(symbol.declarations[i].pos + symbol.declarations[i].getLeadingTriviaWidth());
                    if (transform) {
                        if (node && (transform.isExportedClass || transform.isExportedFunction) && symbol.parent && symbol.parent.valueDeclaration && isInsideCoords(node, symbol.parent.valueDeclaration))
                            return;
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
        if (node.importClause) {
            if (node.importClause.namedBindings && node.importClause.namedBindings.elements && node.importClause.namedBindings.elements.length > 0) {
                node.importClause.namedBindings.elements.forEach(function (el) {
                    let elName = el.name.getText();
                    if (!modulesIdentifiers[elName]) {
                        modulesIdentifiers[elName] = moduleName + "_" + moduleReferencesNames[moduleName];
                    }
                    if (el.propertyName) {
                        refParents.push({
                            pos: el.pos + el.getLeadingTriviaWidth(),
                            aliasEnd: node.importClause.pos,
                            afterEnd: moduleName + "_" + moduleReferencesNames[moduleName] + "." + el.propertyName.getText(),
                            replace: true,
                            moduleName: moduleName + "_" + moduleReferencesNames[moduleName],
                            varName: elName,
                            isTypeOnly: (node.importClause.isTypeOnly)
                        });
                    } else {
                        refParents.push({
                            pos: el.pos + el.getLeadingTriviaWidth(),
                            aliasEnd: node.importClause.pos,
                            afterEnd: moduleName + "_" + moduleReferencesNames[moduleName] + ".",
                            moduleName: moduleName + "_" + moduleReferencesNames[moduleName],
                            varName: elName,
                            isTypeOnly: (node.importClause.isTypeOnly)
                        });
                    }
                });
            }
            if (node.importClause.name) {
                let elName = node.importClause.name.getText();
                if (!modulesIdentifiers[elName]) {
                    modulesIdentifiers[elName] = moduleName + "_" + moduleReferencesNames[moduleName];// + ".default"
                }
                refParents.push({
                    pos: node.importClause.name.pos + node.importClause.name.getLeadingTriviaWidth(),
                    aliasEnd: node.importClause.name.pos,
                    afterEnd: moduleName + "_" + moduleReferencesNames[moduleName] + ".default",
                    replace: true,
                    moduleName: moduleName + "_" + moduleReferencesNames[moduleName],
                    varName: elName,
                    isTypeOnly: (node.importClause.isTypeOnly)
                });
            }
        }
    }

    function getAliasSymbol(symbol) {
        if (symbol && symbol.flags == ts.SymbolFlags.Alias) {
            return checker.getAliasedSymbol(symbol);
        }
    }

    function setExportedIdentifiers(node, moduleName) {
        node.exportClause.elements.forEach(function (el) {
            let moduleNameFromImport = moduleName;
            let elPropertyName = (el.propertyName) ? el.propertyName.getText() : el.name.getText();
            let elName = el.name.getText();
            let text, transform;
            //TODO: exclude type only exports
            let symbol = checker.getSymbolAtLocation(el.name);
            var alias = getAliasSymbol(symbol);
            if (alias && alias.declarations && alias.declarations.length > 0 && checkNonEmitDeclarations(alias)) {
                return;
            }
            if (isImportedIdentifier(elPropertyName) && !moduleName) {
                moduleNameFromImport = modulesIdentifiers[elPropertyName];
                if (alias && alias.escapedName !== "unknown" && moduleNameFromImport !== "global") {
                    transform = findReferencedDeclaration(alias);
                }
                if (!transform) {
                    transform = findReferencedTransformByModule(moduleNameFromImport, elPropertyName);
                    if (transform) {
                        transform.used = true;
                    }
                }
            } else {
                transform = findReferencedTransformByModule("global", elPropertyName);
                if (transform) {
                    transform.used = true;
                }
                if (!transform && (!alias || alias && alias.escapedName == "unknown") && !node.moduleSpecifier) {
                    return;
                }
            }
            if (moduleNameFromImport) {
                let identifier;
                if (transform) {
                    if (transform.isTypeOnly)
                        return;
                    hoistExports("exports", "exports." + elName, true);
                    if (transform.replace) {
                        identifier = transform.afterEnd;
                    } else {
                        identifier = transform.afterEnd + elPropertyName;
                    }
                    if (transform.isStarImport || /[.]default/.test(identifier)) {
                        text = "exports." + elName + " = " + identifier + ";";
                    } else {
                        text = "Object.defineProperty(exports, \"" + elName + "\", { enumerable: true, get: function () { return " + identifier + "; } });";
                    }
                } else {
                    identifier = (/_[\d]+$/.test(moduleNameFromImport)) ? moduleNameFromImport + "." + elPropertyName : moduleNameFromImport;
                    text = "Object.defineProperty(exports, \"" + elName + "\", { enumerable: true, get: function () { return " + identifier + "; } });"
                }
            } else {
                hoistExports("exports", "exports." + elName);
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

    function commentOutTypes(node, arr = edits) {
        if (node.type) {//TODO: super type arguments which is not parsed in node tree
            var pos, end;
            if (ts.isAsExpression(node)) {
                pos = node.type.pos - 2;
            } else {
                pos = node.type.pos - 1;
            }
            if (ts.isTypeAssertion(node)) {
                let coords = getTypeAssertionPosAndEnd(node);
                end = coords.end;
            } else {
                end = node.type.end;
            }
            if (pos && end)
                arr.push({pos: pos, end: end});
        }
        if (node.typeParameters) {
            //i couldn't found better way to solve multiline type parameters
            let coords = getTypeAssertionPosAndEnd(node);
            arr.push({pos: coords.pos, end: coords.end, afterEnd: " "});
        }
        if (node.typeArguments) {
            let coords = getTypeAssertionPosAndEnd(node);
            arr.push({pos: coords.pos, end: coords.end});
        }
        if (node.questionToken && (ts.isParameter(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node) || ts.isShorthandPropertyAssignment(node))) {
            arr.push({
                pos: node.questionToken.pos + node.questionToken.getLeadingTriviaWidth(),
                end: node.questionToken.end
            });
        }
    }

    function getTypeAssertionPosAndEnd(node) {
        let pos, end;
        let children = node.getChildren();
        let childrenLength = children.length;
        for (var i = 0; i < childrenLength; i++) {
            if (children[i].kind === ts.SyntaxKind.LessThanToken) {
                pos = children[i].pos;
            }
            if (children[i].kind === ts.SyntaxKind.GreaterThanToken) {
                end = children[i].end;
            }
        }
        return {"pos": pos, "end": end}
    }

    function hasDeclareModifier(node, commentOut = false) {
        if (node.modifiers && node.modifiers.length > 0) {
            return node.modifiers.some(function (el) {
                if (el.kind == ts.SyntaxKind.DeclareKeyword) {
                    if (commentOut === true) {
                        commentOutNode(el);
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
                    commentOutNode(el);
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
                    afterEnd: afterEnd,
                    order: 0
                });
            }
        }
    }

    function commentOutParametersDecorators(node) {
        let decorators = '';
        let thisParam = getThisParameter(node);
        let parametersLength = node.parameters.length;
        for (var i = 0; i < parametersLength; i++) {
            if (node.parameters[i].decorators && node.parameters[i].decorators.length) {
                let decoratorsLength = node.parameters[i].decorators.length;
                for (var j = 0; j < decoratorsLength; j++) {
                    commentOutNode(node.parameters[i].decorators[j]);
                    let paramNum = (thisParam && thisParam.pos < node.parameters[i].pos) ? i - 1 : i;
                    decorators += "__param(" + paramNum + "," + serveDecorators(node.parameters[i].decorators[j].expression) + "),";
                }
            }
        }

        return decorators;
    }

    function getReferencesFromModule(node) {
        let nestedModule = node;
        while (nestedModule.body.name) {
            refParents.push({
                pos: nestedModule.body.name.pos + nestedModule.body.name.getLeadingTriviaWidth(),
                aliasEnd: nestedModule.body.name.pos + nestedModule.body.name.getLeadingTriviaWidth(),
                afterEnd: nestedModule.name.getText() + '.'
            });
            nestedModule = nestedModule.body;
        }
    }

    function hoistExports(moduleName, exportName, isDefaultAlias = false) {
        if (!isDefaultAlias && exportName === "exports.default")
            return;
        if (moduleName === "exports" && allExports.indexOf(exportName) === -1)
            allExports.unshift(exportName);
    }

    function transformModule(node) {
        let moduleName = node.name.getText();
        let nestedModule = node;
        while (nestedModule.body.name) {
            nestedModule = nestedModule.body;
        }
        if (!isNonEmited(nestedModule)) {
            if (hasExportModifier(node)) {
                let parentModuleName = getModuleName(node);
                let referencedName = parentModuleName + "." + moduleName;
                hoistExports(parentModuleName, referencedName);
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
                textToPaste = ")(" + moduleName + " = " + referencedName + " || (" + referencedName + " = {}));";
            } else {
                if (isDottedModule(node)) {
                    let parentModuleName = node.parent.name.getText();
                    textToPaste = isInsideModuleBlock(node) ?
                        "{let " + moduleName + ";(function (" + moduleName + ")" :
                        "{var " + moduleName + ";(function (" + moduleName + ")";
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
            commentOutNode(node);
        }
    }

    function isInsideModuleBlock(node) {
        let nested = node.parent;
        while (!ts.isSourceFile(nested)) {
            if (ts.isModuleBlock(nested))
                return true;
            nested = nested.parent;
        }
        return false;
    }

    function areNonEmitStatements(statements) {
        //TODO: this should work also from commented edits from source
        return statements.every(function (statement) {
            return (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement));
        })
    }

    function isNonEmitStatement(statement) {
        return (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || hasDeclareModifier(statement));
    }

    function transformEnum(node) {
        let enumName = node.name.getText();
        let textToPaste, initializer, computed = false;
        var enumMemberTransform = [];
        var enumMemberReferenced = [];
        let needWrap = needWrapWithBlock(node);
        if (node.members && node.members.length > 0) {
            initializer = 0;
            let membersLength = node.members.length;
            for (var i = 0; i < membersLength; i++) {
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
                            enumMemberReferenced.forEach(function (el) {
                                currentText = currentText.replace(el.member, el.reference + el.member);
                            });
                            initializer = currentText;
                            enumMemberTransform = [];
                            enumMemberReferenced = [];
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
            let referencedName = moduleName + "." + enumName;
            hoistExports(moduleName, referencedName);
            textToPaste = isDuplicatedDeclaration(node) ?
                "(function (" + enumName + ")" :
                (moduleName != "exports") ?
                    "let " + enumName + ";(function (" + enumName + ")" :
                    "var " + enumName + ";(function (" + enumName + ")";
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.name.end, afterEnd: (needWrap)?'{ '+ textToPaste: textToPaste});
            textToPaste = ")(" + enumName + " = " + referencedName + " || (" + referencedName + " = {}));";
        } else {
            textToPaste = isDuplicatedDeclaration(node) ?
                "(function (" + enumName + ")" :
                (!isGlobalScoped(node)) ?
                    "let " + enumName + ";(function (" + enumName + ")" :
                    "var " + enumName + ";(function (" + enumName + ")";
            edits.push({pos: node.pos + node.getLeadingTriviaWidth(), end: node.name.end, afterEnd: (needWrap)?'{ '+ textToPaste: textToPaste});
            textToPaste = ")(" + enumName + " || (" + enumName + " = {}));";
        }
        edits.push({pos: node.end, end: node.end, afterEnd: (needWrap) ? textToPaste + ' }' : textToPaste});

        function evaluateBinaryExpression(expr) {
            switch (expr.kind) {
                case ts.SyntaxKind.BinaryExpression:
                    evaluateBinaryExpression(expr.left);
                    evaluateBinaryExpression(expr.right);
                    break;
                case ts.SyntaxKind.PropertyAccessExpression:
                    let testReferenced = expr;
                    while (ts.isPropertyAccessExpression(testReferenced)) {
                        testReferenced = testReferenced.expression;
                    }
                    let reference = getReferencedIdentifier(testReferenced);
                    if (reference.text != "")
                        enumMemberReferenced.push({"reference": reference.text, "member": expr.getText()});
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

    function needWrapWithBlock(node) {
        return (ts.isIfStatement(node.parent) ||
            ts.isDoStatement(node.parent) ||
            ts.isWhileStatement(node.parent) ||
            ts.isWithStatement(node.parent) ||
            ts.isForStatement(node.parent) ||
            ts.isForOfStatement(node.parent) ||
            ts.isForInStatement(node.parent))
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

    function isGlobalScoped(node) {
        do {
            node = node.parent;
            if (ts.isModuleDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isBlock(node))
                return false;
        } while (!ts.isSourceFile(node));
        return true;
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
                    commentOutNode(el);
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
        if (moduleName != "exports")
            refParents.push({
                pos: node.pos + node.getLeadingTriviaWidth(),
                aliasEnd: node.pos + node.getLeadingTriviaWidth(),
                afterEnd: moduleName + '.',
                isExportedFunction: true
            });
        let referencedName = moduleName + "." + dotPropertyName;
        hoistExports(moduleName, referencedName);
        let textToPaste = referencedName + " = " + constructionName + ";";
        edits.push({pos: node.end, end: node.end, afterEnd: textToPaste});
    }

    function transformExportClass(node, className) {
        let moduleName = getModuleName(node);
        var constructionName = className.constructionName, dotPropertyName = className.dotPropertyName;
        let referencedName = moduleName + "." + dotPropertyName;
        hoistExports(moduleName, referencedName);
        let textToPaste = ";" + referencedName + " = " + constructionName + ";";
        edits.push({pos: node.end, end: node.end, order: 3, afterEnd: textToPaste});
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
            var moduleName = getModuleName(node);
            var needDeclare = false;
            node.declarationList.declarations.forEach(function (decl) {
                textToPaste = moduleName + ".";
                refParents.push({
                    pos: decl.name.pos + decl.name.getLeadingTriviaWidth(),
                    afterEnd: textToPaste,
                });
                if (!ts.isArrayBindingPattern(decl.name) && !ts.isObjectBindingPattern(decl.name)) {
                    let elName = decl.name.getText();
                    if (!hasDeclareModifier(node))
                        hoistExports(moduleName, moduleName + "." + elName);
                    if (moduleName === "exports" && !modulesIdentifiers[elName]) {
                        modulesIdentifiers[elName] = moduleName;
                    }
                }
                if (decl.initializer) {
                    //TODO: maybe i should use way typescript developers used
                    if (ts.isArrayBindingPattern(decl.name) || ts.isObjectBindingPattern(decl.name)) {
                        needDeclare = true;
                        textToPaste = ';';
                        if (ts.isArrayBindingPattern(decl.name)) {
                            let elementsLength = decl.name.elements.length;
                            for (var i = 0; i < elementsLength; i++) {
                                if (decl.name.elements[i].name) {
                                    let elName = decl.name.elements[i].name.getText();
                                    textToPaste += moduleName + "." + elName + " = " + elName + ";";
                                    refParents.push({
                                        pos: decl.name.elements[i].pos + decl.name.elements[i].getLeadingTriviaWidth(),
                                        afterEnd: moduleName + ".",
                                    });
                                }
                            }
                        }
                        if (ts.isObjectBindingPattern(decl.name)) {
                            transformObjectBindingPatternElements(decl.name);
                        }
                        edits.push({
                            pos: decl.end,
                            end: decl.end,
                            afterEnd: textToPaste
                        });
                    } else {
                        //TODO: solve situations with not normal commas with spaces
                        edits.push({
                            pos: decl.pos + decl.getLeadingTriviaWidth(),
                            end: decl.pos + decl.getLeadingTriviaWidth(),
                            afterEnd: textToPaste
                        });
                        edits.push({
                            pos: decl.end,
                            end: decl.end + 1,
                            afterEnd: ";"
                        });
                    }
                } else {
                    edits.push({
                        pos: decl.pos + decl.getLeadingTriviaWidth(),
                        end: decl.end + 1
                    });
                }
            });
            if (!needDeclare) {
                edits.push({
                    pos: node.pos + node.getLeadingTriviaWidth(),
                    end: node.declarationList.declarations[0].pos
                });
            }
        }

        function transformObjectBindingPatternElements(savedNode) {
            let elementsLength = savedNode.elements.length;
            for (var i = 0; i < elementsLength; i++) {
                if (savedNode.elements[i].name) {
                    if (savedNode.elements[i].name.elements) {
                        transformObjectBindingPatternElements(savedNode.elements[i].name);
                    } else {
                        let elName = savedNode.elements[i].name.getText();
                        textToPaste += moduleName + "." + elName + " = " + elName + ";";
                        refParents.push({
                            pos: savedNode.elements[i].pos + savedNode.elements[i].getLeadingTriviaWidth(),
                            afterEnd: moduleName + ".",
                        });
                    }
                }
            }
        }
    }

    function isDottedModule(node) {
        return (node.parent && ts.isModuleDeclaration(node.parent));
    }

    function isInsideModule(node) {
        return (node.parent && node.parent.parent && ts.isModuleDeclaration(node.parent.parent));
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
            return (el.pos === endPos && !el.isTypeOnly)
        });
    }

    function findReferencedTransformByModule(moduleName, varName) {
        return refParents.find(function (el) {
            return (el.moduleName === moduleName && el.varName === varName)
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
            let aliasUsed;
            if (!el.isImportEquals) {
                aliasUsed = refParents.some(function (alias) {
                    return (alias.moduleName && el.moduleName === alias.moduleName && alias.used);
                });
            }
            if (!el.used && !aliasUsed) {
                let currentEdit = edits.find(function (edit) {
                    return (edit.aliasEnd !== undefined && edit.aliasEnd == el.aliasEnd);
                });
                if (currentEdit)
                    currentEdit.afterEnd = '';
            }
        });
    }

    commentOutUnusedDeclarations();
    if (exportExists && !moduleExportExists) {
        edits.push({
            pos: startPos,
            end: startPos,
            afterEnd: ";Object.defineProperty(exports, \"__esModule\", { value: true });",
            order: 1
        });
    }
    if (allExports.length > 0) {
        let exportsVoid = allExports.join(" = ") + " = void 0;";
        edits.push({
            pos: startPos,
            end: startPos,
            afterEnd: exportsVoid,
            order: 0
        });
    }
    return {edits: edits, diagnostics: syntacticErrors};
}

function isInsideCoords(firstObject, secondObject) {
    return firstObject.pos >= secondObject.pos && firstObject.end <= secondObject.end;
}

function serveEdits(edits) {
    edits.sort((a, b) => b.end - a.end || a.order - b.order);

    for (var i = 1; i < edits.length; i++) {
        for (var j = i - 1; j >= 0; j--) {
            if (isInsideCoords(edits[j + 1], edits[j])) {
                let cond1 = edits[j + 1].pos === edits[j].pos && edits[j + 1].end === edits[j].end || edits[j].end === edits[j + 1].pos;
                let cond2 = edits[j + 1].end === edits[j].pos;
                if (cond1 || cond2) {
                    if (!edits[j].afterEnd)
                        edits[j].afterEnd = "";
                    if (!edits[j + 1].afterEnd)
                        edits[j + 1].afterEnd = "";
                    if (cond1) {
                        edits[j].afterEnd += edits[j + 1].afterEnd;
                    } else {
                        edits[j].afterEnd = edits[j + 1].afterEnd + edits[j].afterEnd;
                    }
                }
                edits.splice(j + 1, 1);
                i--;
            }
        }
    }
    return edits;
}

function applyEdits(code, remove, edits) {
    var start = code;
    var end = "";

    edits = serveEdits(edits);
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

var transpile = function (code, options, remove) {
    return transpileModule(code, options, remove).outputText;
};

/*
     * This function will compile source text from 'input' argument using specified compiler options.
     * Extra compiler options that will unconditionally be used by this function are:
     * - isolatedModules = true
     * - noLib = true
     * - noResolve = true
     */
var transpileModule = function (code, options, remove) {
    options.noResolve = true;
    options.isolatedModules = true;
    options.noLib = true;
    let edits = deTypescript(['transpile-dummy.ts'], options, code);
    return {outputText: applyEdits(code, remove, edits.edits), diagnostics: edits.diagnostics};
};

exports.transpile = transpile;
exports.transpileModule = transpileModule;
exports.ModuleKind = ts.ModuleKind;
exports.ScriptKind = ts.ScriptKind;