var ts = require("typescript");
var dts = require("./generate-js");
//Example from TypeScript Handbook
const source = "import \"reflect-metadata\";\n" +
    "\n" +
    "class Point {\n" +
    "    x: number;\n" +
    "    y: number;\n" +
    "}\n" +
    "\n" +
    "class Line {\n" +
    "    private _p0: Point;\n" +
    "    private _p1: Point;\n" +
    "\n" +
    "    @validate\n" +
    "    set p0(value: Point) { this._p0 = value; }\n" +
    "    get p0() { return this._p0; }\n" +
    "\n" +
    "    @validate\n" +
    "    set p1(value: Point) { this._p1 = value; }\n" +
    "    get p1() { return this._p1; }\n" +
    "}\n" +
    "\n" +
    "function validate<T>(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<T>) {\n" +
    "    let set = descriptor.set;\n" +
    "    descriptor.set = function (value: T) {\n" +
    "        let type = Reflect.getMetadata(\"design:type\", target, propertyKey);\n" +
    "        if (!(value instanceof type)) {\n" +
    "            throw new TypeError(\"Invalid type.\");\n" +
    "        }\n" +
    "        set.call(target, value);\n" +
    "    }\n" +
    "}";

let result = dts.transpileTypescriptCode(source, {
    target: ts.ScriptTarget.ES5,
    module: "None",
    allowJs: false,
    lib: [],
    types: [],
    noEmit: true
}, true);
console.log(result);