var ts = require("typescript");
var fs = require("fs");
var hrstart = process.hrtime();

function generateJavaScriptFile(path, options) {
    add(path[0]);

    function add(path) {
        try {
            var stat = fs.statSync(path);
        } catch (e) {
            return;
        }
        if (stat.isFile() && /([^d]|[^.]d)\.ts$/.test(path)) {
            console.log(path + "\r\n");
            var fileArr = [];
            fileArr.push(path);
            var typescriptFile = fs.readFileSync(path, "utf8");
            var transpileCode = compileTypescript(typescriptFile, path.split('/').slice(-1)[0]);
            let source = typescriptFile;
            if (transpileCode.diagnostics.length === 0)
                source = transpileCode.outputText;
            var filenameNew = path.replace(/.ts$/, "Ts.js");
            fs.writeFileSync(filenameNew, source);
        } else if (stat.isDirectory()) {
            var files = fs.readdirSync(path).sort();
            files.forEach(function (name) {
                add(path + "/" + name)
            });
        }
    }
}

function compileTypescript(code, fileName) {
    return ts.transpileModule(code, {
        compilerOptions: {
            newLine: "lf",
            downlevelIteration: true,
            suppressExcessPropertyErrors: true,
            module: ts.ModuleKind.CommonJS,
            removeComments: false,
            target: ts.ModuleKind.ESNext,
            noEmitHelpers: true,
            preserveConstEnums: true,
            noImplicitUseStrict: true
        },
        fileName: fileName,
        reportDiagnostics: true
    });
}
generateJavaScriptFile(process.argv.slice(2));
var hrend = process.hrtime(hrstart);
console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);