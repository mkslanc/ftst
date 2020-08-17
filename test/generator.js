var transpiler = require("../transpiler");
var fs = require("fs");

function generateJavaScriptFile(path, options) {
    add(path[0]);

    function add(path) {
        try {
            var stat = fs.statSync(path);
        } catch (e) {
            return;
        }
        if (stat.isFile() && /([^d]|[^.]d)\.tsx?$/.test(path) && !/binderBinaryExpressionStress/.test(path)) {
            var fileArr = [];
            fileArr.push(path);
            var filename = path.replace(/.tsx?$/, "Js.js");
            fs.copyFileSync(path, filename);
            applyEditsToFile(filename);
        } else if (stat.isDirectory()) {
            var files = fs.readdirSync(path).sort();
            files.forEach(function (name) {
                add(path + "/" + name)
            });
        }
    }

    function applyEditsToFile(filename) {
        var start = fs.readFileSync(filename, "utf8");
        start = start.replace(/^\uFEFF/, '');
        let end = transpiler.transpileModule(start, options, (process.argv[3] === "-d"));
        fs.writeFileSync(filename, end.outputText);
    }
}

if (process.argv.length > 2) {
    generateJavaScriptFile(process.argv.slice(2), {
        compilerOptions: {
            target: transpiler.ScriptTarget.ES2020,
            module: "None",
            allowJs: false,
            lib: [],
            types: [],
            noEmit: true,
            noLib: true,
            noResolve: true,
            isolatedModules: true,
            suppressOutputPathCheck: true,
            jsx: "react"
        }
    });
}