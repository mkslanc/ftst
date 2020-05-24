var fs = require("fs");
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
    if (stat.isFile() && /Js\.js$/.test(path)) {
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

describe('Tests running on TS test cases comparing transpiling diffs: ', function () {

    tests.forEach(function (test) {
        if (test.skipped) {
            it.skip('no significant diffs with TS in `' + test.path + '`', function () {
                let equals = utilities.equalResults(test.path);
                assert.ok(!(equals && Array.isArray(equals)));
            });
        } else {
            it('no significant diffs with TS in `' + test.path + '`', function () {
                let equals = utilities.equalResults(test.path);
                assert.ok(!(equals && Array.isArray(equals)));
            });
        }
    });
});