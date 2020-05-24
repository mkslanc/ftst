var fs = require("fs");
const prettier = require("prettier");
var jsdiff = require('diff');

/**
 * @return {undefined|Array|boolean}
 */
exports.equalResults = function (path) {
    var first = fs.readFileSync(path, "utf8");

    var newFileName = path.replace(/Js\.js/, "Ts.js");
    if (!fs.existsSync(newFileName))
        return;
    var second = fs.readFileSync(newFileName, "utf8");

    if (first && second && !/static\s/.test(first)) {

        first = first.replace("Object.defineProperty(exports, \"__esModule\", { value: true });", "");
        second = second.replace("Object.defineProperty(exports, \"__esModule\", { value: true });", "");

        first = first.replace(/(?<=^|[^/]|[*][/])[/][*][\s\S]*?[*][/]/gm, "");
        first = first.replace(/[/][/].*$/gm, "");

        first = first.replace(/exports[.][\w_]+\s*=\s*.*void 0;/, "");
        second = second.replace(/exports[.][\w_]+\s*=\s*.*void 0;/, "");

        var moduleMatch = first.match(/module[.]exports\s*=.*(?=$|\s*[/][/])/m);
        if (moduleMatch) {
            var moduleFoundRegExp = new RegExp(moduleMatch[0].replace(/([()\[\]|])/g, "\\$1"));
            if (moduleFoundRegExp.test(second)) {
                first = first.replace(moduleFoundRegExp, "");
                second = second.replace(moduleFoundRegExp, "");
            }
        }
        var defaultMatch = first.match(/exports[.]default\s*=[^(;\r\n]*;/);
        if (defaultMatch) {
            var defaultFoundRegExp = new RegExp(defaultMatch[0]);
            if (defaultFoundRegExp.test(second)) {
                first = first.replace(defaultFoundRegExp, "");
                second = second.replace(defaultFoundRegExp, "");
            }
        }
        var exportMatch = first.match(/exports[.][\w_]+\s*=\s*[\w._]+(?=;|$)/gm);
        if (exportMatch) {
            for (var i = 0; i < exportMatch.length; i++) {
                var exportFoundRegExp = new RegExp(exportMatch[i]);
                if (exportFoundRegExp.test(second)) {
                    first = first.replace(exportFoundRegExp, "");
                    second = second.replace(exportFoundRegExp, "");
                }
            }
        }
        var exportDefineMatch = first.match(/Object\.defineProperty\(exports,.*?\);/gm);
        if (exportDefineMatch) {
            for (var i = 0; i < exportDefineMatch.length; i++) {
                var exportDefineFoundRegExp = new RegExp(exportDefineMatch[i].replace(/([()\[\]|.])/g, "\\$1"));
                if (exportDefineFoundRegExp.test(second)) {
                    first = first.replace(exportDefineFoundRegExp, "");
                    second = second.replace(exportDefineFoundRegExp, "");
                }
            }
        }

        second = second.replace(/(?<=^|[^/])[/][*][\s\S]*?[*][/]/gm, "");
        second = second.replace(/[/][/].*$/gm, "");
        try {
            second = prettier.format(second, {semi: false, parser: "babel"});
        } catch (e) {
            return;
        }
        try {
            first = prettier.format(first, {semi: false, parser: "babel"});
        } catch (e) {
            console.log(path + "\r\n");
            console.log(e);
            return;
        }

        //TODO: experimental!
        first = first.replace(/constructor\s*\((?:[\w\s,]*)?\)\s*{/gm, "");
        second = second.replace(/constructor\s*\((?:[\w\s,]*)?\)\s*{/gm, "");
        first = first.replace(/(\(\s*)?this(\s*\))?(?:[.]|\[(.*?)\])/gm, "$1$2$3");
        second = second.replace(/(\(\s*)?this(\s*\))?(?:[.]|\[(.*?)\])/gm, "$1$2$3");
        first = first.replace(/super\(.*?\)/gs, "");
        second = second.replace(/super\(.*?\)/gs, "");
        // ^^^^^^^^^^^^^^^^^^^^^^^^^

        var diff = jsdiff.diffWords(first, second);
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