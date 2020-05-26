require('colors');
var fs = require("fs");
const Path = require('path');
var hrstart = process.hrtime();
var blackList = require("./blacklist").blackList;
var utilities = require("./utilities-diff");

function generateDiffHtmls(path, options) {
    deleteFolderRecursive(process.argv[3]);
    utilities.updateBlackListPath(process.argv[2], blackList);
    add(path[0]);

    function add(path) {
        try {
            var stat = fs.statSync(path);
        } catch (e) {
            return;
        }
        if (stat.isFile() && /([^d]|[^.]d)\.ts$/.test(path) && blackList.indexOf(path) === -1) {
            //console.log(path + "\r\n");
            var diffs = utilities.equalResultsFromFiles(path);
            if (diffs && Array.isArray(diffs)) {
                var span = '';

                diffs.forEach(function (part) {
                    // green for additions, red for deletions
                    // grey for common parts
                    var color = part.added ? 'green; font-weight: bolder; font-size: large' :
                        part.removed ? 'red; font-weight: bolder; font-size: large' : 'grey';
                    span += `<span style="color:` + color + `">` + part.value + `</span>`;
                });
                var sourceText = `<pre>` + span + `</pre>`;
                fs.writeFileSync(process.argv[3] + '/' + path + '.html', sourceText);
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

const deleteFolderRecursive = function (path) {
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
        files.forEach(function (file) {
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

if (process.argv.length > 2) {
    generateDiffHtmls(process.argv.slice(2));
    cleanEmptyFoldersRecursively(process.argv[3]);
    var hrend = process.hrtime(hrstart);
    console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000);
}