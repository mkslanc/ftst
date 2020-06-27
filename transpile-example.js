var ftst = require("./transpiler");
//Example from TypeScript Handbook
var options = {
    compilerOptions: {
        newLine: "lf",
        downlevelIteration: true,
        suppressExcessPropertyErrors: true,
        module: ftst.ModuleKind.CommonJS,
        removeComments: false,
        target: ftst.ScriptTarget.ES2020,
        noEmitHelpers: true,
        preserveConstEnums: true,
        noImplicitUseStrict: true
    },
    fileName: 'transpile-dummy.ts',
    reportDiagnostics: true
};
var source = "import \"reflect-metadata\";\n" +
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

let result = ftst.transpileModule(source, options, true);
console.log(result);