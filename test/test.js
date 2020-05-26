var fs = require("fs");
var mocha = require('mocha');
var ts = require("typescript");
var transpiler = require("../transpiler");
var assert = require('assert');
var blacklist = require('../blacklist').blackList;
var utilities = require("../utilities-diff");
utilities.updateBlackListPath("./typescript_tests/tests/cases", blacklist);
var tests = [];
add("./typescript_tests/tests/cases");

function add(path) {
    try {
        var stat = fs.statSync(path);
    } catch (e) {
        return;
    }
    if (stat.isFile() && /([^d]|[^.]d)\.ts$/.test(path)) {
        if (blacklist.indexOf(path) > -1) {
            tests.push({path: path, skipped: true});
        } else {
            tests.push({path: path});
        }
    } else if (stat.isDirectory()) {
        var files = fs.readdirSync(path).sort();
        files.forEach(function (name) {
            add(path + "/" + name)
        });
    }
}

mocha.describe('Tests running on TS test cases comparing transpiling diffs: ', function () {
    var options = {
        compilerOptions: {
            newLine: "lf",
            downlevelIteration: true,
            suppressExcessPropertyErrors: true,
            module: ts.ModuleKind.CommonJS,
            removeComments: false,
            target: ts.ScriptTarget.ESNext,
            noEmitHelpers: true,
            preserveConstEnums: true,
            noImplicitUseStrict: true
        },
        fileName: 'transpile-dummy.ts',
        reportDiagnostics: true
    };
    var tsAllTime = 0n, myAllTime = 0n;

    tests.forEach(function (test) {
        if (test.skipped) {
            mocha.it.skip('no significant diffs with TS in `' + test.path + '`', function () {

            });
        } else {
            mocha.it('no significant diffs with TS in `' + test.path + '`', function () {
                var tsFile = fs.readFileSync(test.path, "utf8");

                let myTime = process.hrtime.bigint();
                let myResult = transpiler.transpileModule(tsFile, options);
                if (myResult.diagnostics.length > 0)
                    this.skip();
                myAllTime += process.hrtime.bigint() - myTime;

                let tsTime = process.hrtime.bigint();
                let tsResult = ts.transpileModule(tsFile, options);
                tsAllTime += process.hrtime.bigint() - tsTime;

                let equals = utilities.equalResults(myResult.outputText, tsResult.outputText);
                assert.ok(!(equals && Array.isArray(equals)));
            });
        }
    });

    mocha.it('execution time of this transpiler should be less than typescripts', function () {
        console.log ('This transpiler execution time: ' + myAllTime + ' nanoseconds');
        console.log ('TS transpiler execution time: ' + tsAllTime + ' nanoseconds');
        assert.ok(myAllTime < tsAllTime);
    });
});