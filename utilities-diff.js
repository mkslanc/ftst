var fs = require("fs");
const prettier = require("prettier");
var jsdiff = require('diff');

/**
 * @return {undefined|Array|boolean}
 */
exports.equalResultsFromFiles = function (path) {
    var firstFileName = path.replace(/\.ts/, "Js.js");
    if (!fs.existsSync(firstFileName))
        return;
    var first = fs.readFileSync(firstFileName, "utf8");
    var newFileName = path.replace(/\.ts/, "Ts.js");
    if (!fs.existsSync(newFileName))
        return;
    var second = fs.readFileSync(newFileName, "utf8");
    return equalResults(first, second);
};

var equalResults = exports.equalResults = function (myCode, tsCode) {
    if (myCode && tsCode && !/static\s/.test(myCode)) {

        myCode = myCode.replace("Object.defineProperty(exports, \"__esModule\", { value: true });", "");
        tsCode = tsCode.replace("Object.defineProperty(exports, \"__esModule\", { value: true });", "");

        myCode = myCode.replace(/(?<=^|[^/]|[*][/])[/][*][\s\S]*?[*][/]/gm, "");
        myCode = myCode.replace(/[/][/].*$/gm, "");

        myCode = myCode.replace(/exports[.][\w_]+\s*=\s*.*void 0;/, "");
        tsCode = tsCode.replace(/exports[.][\w_]+\s*=\s*.*void 0;/, "");

        var moduleMatch = myCode.match(/module[.]exports\s*=.*(?=$|\s*[/][/])/m);
        if (moduleMatch) {
            var moduleFoundRegExp = new RegExp(moduleMatch[0].replace(/([()\[\]|])/g, "\\$1"));
            if (moduleFoundRegExp.test(tsCode)) {
                myCode = myCode.replace(moduleFoundRegExp, "");
                tsCode = tsCode.replace(moduleFoundRegExp, "");
            }
        }
        var defaultMatch = myCode.match(/exports[.]default\s*=[^(;\r\n]*;/);
        if (defaultMatch) {
            var defaultFoundRegExp = new RegExp(defaultMatch[0]);
            if (defaultFoundRegExp.test(tsCode)) {
                myCode = myCode.replace(defaultFoundRegExp, "");
                tsCode = tsCode.replace(defaultFoundRegExp, "");
            }
        }
        var exportMatch = myCode.match(/exports[.][\w_]+\s*=\s*[\w._]+(?=;|$)/gm);
        if (exportMatch) {
            for (var i = 0; i < exportMatch.length; i++) {
                var exportFoundRegExp = new RegExp(exportMatch[i]);
                if (exportFoundRegExp.test(tsCode)) {
                    myCode = myCode.replace(exportFoundRegExp, "");
                    tsCode = tsCode.replace(exportFoundRegExp, "");
                }
            }
        }
        var exportDefineMatch = myCode.match(/Object\.defineProperty\(exports,.*?\);/gm);
        if (exportDefineMatch) {
            for (var i = 0; i < exportDefineMatch.length; i++) {
                var exportDefineFoundRegExp = new RegExp(exportDefineMatch[i].replace(/([()\[\]|.])/g, "\\$1"));
                if (exportDefineFoundRegExp.test(tsCode)) {
                    myCode = myCode.replace(exportDefineFoundRegExp, "");
                    tsCode = tsCode.replace(exportDefineFoundRegExp, "");
                }
            }
        }

        tsCode = tsCode.replace(/(?<=^|[^/])[/][*][\s\S]*?[*][/]/gm, "");
        tsCode = tsCode.replace(/[/][/].*$/gm, "");
        try {
            tsCode = prettier.format(tsCode, {semi: false, parser: "babel"});
        } catch (e) {
            return;
        }
        myCode = prettier.format(myCode, {semi: false, parser: "babel"});

        //TODO: experimental!
        myCode = myCode.replace(/constructor\s*\((?:[\w\s,]*)?\)\s*{/gm, "");
        tsCode = tsCode.replace(/constructor\s*\((?:[\w\s,]*)?\)\s*{/gm, "");
        myCode = myCode.replace(/(\(\s*)?this(\s*\))?(?:[.]|\[(.*?)\])/gm, "$1$2$3");
        tsCode = tsCode.replace(/(\(\s*)?this(\s*\))?(?:[.]|\[(.*?)\])/gm, "$1$2$3");
        myCode = myCode.replace(/super\(.*?\)/gs, "");
        tsCode = tsCode.replace(/super\(.*?\)/gs, "");
        // ^^^^^^^^^^^^^^^^^^^^^^^^^

        var diff = jsdiff.diffWords(myCode, tsCode);
        if (diff.length > 1 || (diff.length == 1 && (diff[0].added || diff[0].removed))) {
            for (var i = 0; i < diff.length; i++) {
                if ((diff[i].removed || diff[i].added)) {
                    if (/^[\s]+$/s.test(diff[i].value) || /^\s*[{}];?\s*$/s.test(diff[i].value) || /#[\w]+\s*}?/.test(diff[i].value)) {
                        diff.splice(i, 1);
                        i--;
                    }
                }
            }

            let check = diff.every(function (part) {
                return ((!part.removed && !part.added))
            });
            if (!check)
                return diff;
        }
    }
};

exports.updateBlackListPath = function (currentPath, blackList) {
    blackList.forEach(function (el, index, arr) {
        arr[index] = currentPath + "/" + el;
    });
};