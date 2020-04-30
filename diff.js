require('colors');
var jsdiff = require('diff');
var fs = require("fs");
const Path = require('path');
var hrstart = process.hrtime();
function generateJavaScriptFile(path, options) {
    deleteFolderRecursive(process.argv[3]);
    add(path[0]);

    function add(path) {
        try {
            var stat = fs.statSync(path);
        } catch (e) {
            return;
        }
        if (stat.isFile() && /Js\.js$/.test(path)) {
            //console.log(path + "\r\n");
            var first = fs.readFileSync(path, "utf8");

            var newFileName = path.replace(/Js\.js/, "Ts.js");
            var second = fs.readFileSync(newFileName, "utf8");
            //TODO: delete it! for our tests we just ignoring files with "static" word
            if (first && second && !/static\s/.test(first)) {
                var span = '';
                first = first.replace(/(?<=^|[^/]|[*][/])[/][*][\s\S]*?[*][/]/gm, "");
                //first = first.replace(/\/\/\s@Filename: .*?\.json.*?(?=\/\/\s@|$)/gs, "");
                first = first.replace(/[/][/].*$/gm, "");
                var moduleMatch = first.match(/module[.]exports\s*=.*(?=$|\s*[/][/])/m);
                if (moduleMatch) {
                    var moduleFoundRegExp = new RegExp(moduleMatch[0].replace(/([()\[\]])/g,"\\$1"));
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
                var exportMatch = first.match(/exports[.][\w_]+\s*=\s*[\w._]+/gm);
                if (exportMatch) {
                    for (var i = 0; i < exportMatch.length; i++) {
                        var exportFoundRegExp = new RegExp(exportMatch[i]);
                        if (exportFoundRegExp.test(second)) {
                            first = first.replace(exportFoundRegExp, "");
                            second = second.replace(exportFoundRegExp, "");
                        }
                    }
                }
                second = second.replace(/(?<=^|[^/])[/][*][\s\S]*?[*][/]/gm, "");
                //second = second.replace(/\/\/\s@Filename: .*?\.json.*?(?=\/\/\s@|$)/gs, "");
                second = second.replace(/[/][/].*$/gm, "");
                //TODO: experimental!
                first = first.replace(/constructor\((?:[\w\s,]*)?\)\s*{/gm, "");
                second = second.replace(/constructor\((?:[\w\s,]*)?\)\s*{/gm, "");
                first = first.replace(/(?:\(\s*)?this(?:\s*\))?\./gm, "");
                second = second.replace(/(?:\(\s*)?this(?:\s*\))?\./gm, "");
                first = first.replace(/super\(.*?\)/gs, "");
                second = second.replace(/super\(.*?\)/gs, "");
                // ^^^^^^^^^^^^^^^^^^^^^^^^^
                first = first.replace(/(\s)+/gs,'$1');
                second = second.replace(/(\s)+/gs,'$1');
                first = first.replace(/[;]+/gs,' ');
                second = second.replace(/[;]+/gs,' ');

                var diff = jsdiff.diffWords(first, second);
                if (diff.length > 1 || (diff.length == 1 && (diff[0].added || diff[0].removed))) {
                    for (var i = 0; i < diff.length; i++) {
                        if ((diff[i].removed || diff[i].added)) {
                            if (/^[*\s;'"(),/~.-]+$/s.test(diff[i].value)) {
                                diff.splice(i, 1);
                                i--;
                            } else {
                                if ((/^(?:constructor\((?:[\s\w,]*)?\)\s*)?(?:{\s*)?(?:super\(...arguments\)[; ])?\s*(:?this\.)?$/s.test(diff[i].value) || /^this\.$/s.test(diff[i].value) || /^\s*[{}];?\s*$/s.test(diff[i].value))) {
                                    diff.splice(i, 1);
                                    i--;
                                } else {
                                    if (/Object\.defineProperty\(exports,/.test(diff[i].value)) {
                                        diff.splice(i, 1);
                                        i--;

                                    } else {
                                        if (/"__esModule", { value: true }\)[; ]/.test(diff[i].value)) {
                                            diff.splice(i, 1);
                                            i--;
                                        } else {//private identifiers
                                            if (/#[\w]+\s*}?/.test(diff[i].value)) {
                                                diff.splice(i, 1);
                                                i--;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    var check = diff.every(function (part) {
                        return ((!part.removed && !part.added))
                    });
                    if (!check) {
                        diff.forEach(function (part) {
                            // green for additions, red for deletions
                            // grey for common parts
                            var color = part.added ? 'green; font-weight: bolder; font-size: large' :
                                part.removed ? 'red; font-weight: bolder; font-size: large' : 'grey';
                            span += `<span style="color:` + color + `">` + part.value + `</span>`;
                        });
                        var sourceText = `<pre>` + span + `</pre>`;
                        fs.writeFileSync(process.argv[3] +'/' + path + '.html', sourceText);
                    }

                }
            }
        } else if (stat.isDirectory()) {
            if (!fs.existsSync(process.argv[3] + '/' + path)) {
                fs.mkdirSync(process.argv[3] + '/' + path, {recursive: true});
            }
            var files = fs.readdirSync(path).sort();
            files.forEach(function (name) {
                add(path + "/" + name)
            });
        }
    }
}

const deleteFolderRecursive = function(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach((file, index) => {
            const curPath = Path.join(path, file);
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
    }
};

function cleanEmptyFoldersRecursively(folder) {
    var isDir = fs.statSync(folder).isDirectory();
    if (!isDir) {
        return;
    }
    var files = fs.readdirSync(folder);
    if (files.length > 0) {
        files.forEach(function(file) {
            var fullPath = Path.join(folder, file);
            cleanEmptyFoldersRecursively(fullPath);
        });

        // re-evaluate files; after deleting subfolder
        // we may have parent folder empty now
        files = fs.readdirSync(folder);
    }

    if (files.length == 0) {
        fs.rmdirSync(folder);
        return;
    }
}

generateJavaScriptFile(process.argv.slice(2));

cleanEmptyFoldersRecursively(process.argv[3]);
var hrend = process.hrtime(hrstart);
console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);