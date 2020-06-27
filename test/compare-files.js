var exec = require('child_process').exec;
const dircompare = require('dir-compare');
var path = require('path');

var projectPath = 'C:\\AppServ\\www\\ignore-typescript-compiler\\';
const options = {compareSize: true};
// Multiple compare strategy can be used simultaneously - compareSize, compareContent, compareDate, compareSymlink.
// If one comparison fails for a pair of files, they are considered distinct.
const path1 = 'tests-before';
const path2 = 'tests-after';

// Asynchronous
dircompare.compare(path1, path2, options)
    .then(res => print(res))
    .catch(error => console.error(error));


function print(result) {
    console.log('Directories are %s', result.same ? 'identical' : 'different')

    console.log('Statistics - equal entries: %s, distinct entries: %s, left only entries: %s, right only entries: %s, differences: %s',
        result.equal, result.distinct, result.left, result.right, result.differences)

    result.diffSet.forEach(function (dif) {
        if (dif.state != "equal") {
            if (dif.type1 != "directory" && dif.type2 != "directory") {
                console.log('Difference - name1: %s, type1: %s, name2: %s, type2: %s, state: %s',
                    path.normalize(dif.path1 + '/' + dif.name1), dif.type1, dif.name2, dif.type2, dif.state);
                if (dif.name2 && dif.name1 == undefined) {
                    let curPath = path.normalize(projectPath + dif.path2 + '\\' + dif.name2);
                    exec('start chrome ' + curPath, function (err) {
                        if (err) { //process error
                        }
                    })
                }
            }
        }
    })

}
