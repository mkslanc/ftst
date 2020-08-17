var fs = require("fs");
function add(path) {
    try {
        var stat = fs.statSync(path);
    } catch (e) {
        return;
    }
    if (stat.isFile() && /\.tsx?$/.test(path)) {
        console.log(path + "\r\n");
        var fileArr = [];
        fileArr.push(path);
        var typescriptFile = fs.readFileSync(path, "utf8");
        var transpileCode = typescriptFile.split(/\/\/\s*@filename: ([^\s]+).*/gmi);
        if (transpileCode.length > 1) {
            transpileCode.shift();
            let tsFileDir = './typescript_tests/' + path + '/';
            if (!fs.existsSync(tsFileDir)) {
                fs.mkdirSync(tsFileDir, {recursive: true});
            }
            for (var i = 1; i < transpileCode.length; i = i + 2) {
                let dirName = transpileCode[i - 1].replace(/[:\\]/g,"_").split("/").slice(0, -1).join('/');
                if (!fs.existsSync(tsFileDir + dirName)) {

                    fs.mkdirSync(tsFileDir + dirName, {recursive: true});
                }
                fs.writeFileSync(tsFileDir + transpileCode[i - 1].replace(/[:\\]/g,"_"), transpileCode[i]);
            }
        } else {
            let dirName = './typescript_tests/' + path.split('/').slice(0, -1).join('/');
            if (!fs.existsSync(dirName)) {
                fs.mkdirSync(dirName, {recursive: true});
            }
            fs.writeFileSync('./typescript_tests/' + path, transpileCode[0]);
        }
    } else if (stat.isDirectory()) {
        var files = fs.readdirSync(path).sort();
        files.forEach(function (name) {
            add(path + "/" + name)
        });
    }
}

add(process.argv[2]);