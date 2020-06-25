exports.blackList =
    [
        //Vars outside scope
        "conformance/expressions/optionalChaining/optionalChainingInParameterInitializer.ts",
        "conformance/types/union/unionTypeReduction2.ts",
        "conformance/expressions/optionalChaining/callChain/thisMethodCall.ts",
        "conformance/expressions/nullishCoalescingOperator/nullishCoalescingOperatorInAsyncGenerator.ts",
        "conformance/controlFlow/exhaustiveSwitchStatements1.ts",
        "conformance/expressions/nullishCoalescingOperator/nullishCoalescingOperatorInParameterInitializer.ts",
        "conformance/controlFlow/controlFlowOptionalChain.ts",
        "conformance/expressions/optionalChaining/callChain/callChainWithSuper.ts",
        "conformance/expressions/optionalChaining/callChain/superMethodCall.ts",
        //differences in arrow function param transformation:
        "conformance/expressions/nullishCoalescingOperator/nullishCoalescingOperatorInParameterInitializer.2.ts",
        "conformance/expressions/optionalChaining/optionalChainingInParameterInitializer.2.ts",
        //differences with object/array binding patterns assignments transformation
        "conformance/expressions/optionalChaining/optionalChainingInParameterBindingPattern.ts",
        "conformance/expressions/optionalChaining/optionalChainingInParameterBindingPattern.2.ts",
        "conformance/expressions/nullishCoalescingOperator/nullishCoalescingOperatorInParameterBindingPattern.ts",
        "conformance/expressions/nullishCoalescingOperator/nullishCoalescingOperatorInParameterBindingPattern.2.ts",
        //TODO: could be bug
        "conformance/expressions/nullishCoalescingOperator/nullishCoalescingOperator3.ts",
        //just ignore
        "compiler/propertyAccessExpressionInnerComments.ts",
    ];