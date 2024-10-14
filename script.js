import * as javaParser from "https://esm.run/java-parser";
import mermaid from "https://esm.run/mermaid";

mermaid.initialize();

const DEFAULT_CODES = [
  {
    name: "Unvar",
    value: `
int f() {
  int a = 1;
  a = 1;
}
`,
  },
  {
    name: "Dataflow example",
    value: `
public class DFExample{
  int fib(int n, int m)
  {
    int a;
    int b = 1;
    int c = n;
    int d, e = 2;
    a = 1 - b;
    c = c + 1;
    if (a < 1) {
      d = a + 1;
    } else {
      d = b + 1;
    }
    e++;
    for(int i; i < n; i++) {
      c += i;
    }
    System.out.println(c);
    return d;
  }
}
`,
  },
  {
    name: "For example",
    value: `
public class ForExample{
  int fib(int n)
  {
    for (i = 1; i < n; i++)
    {
      a = i;
    }

    for (i = 2; i < n; i++)
    {
      if(i > 3) break;
      if(i == 1) continue;
    }

    for(;;);
  }
}
`,
  },
  {
    name: "Unreachable code",
    value: `
public class UnExample{
  int unreachable(int n)
  {
    return 1;
    return 2;
  }
}
`,
  },
  {
    name: "Comments",
    value: `
public class CommExample{
  int fib(int n)
  {
    int a;
    // a
    int b;
    /* b */
    int c;
  }
}
`,
  },
  {
    name: "If example",
    value: `
public class IfExample{
  int fib(int n)
  {
    int a;
    if (n < 1) a = 0;

    if (n > 2) {
      a = 1;
    } else {
      return 2;
    }

    if (n > 3) {
      if (n > 4) {
        return 3;
      } else {
        a = 4;
      }
    } else {
      return 5;
    }
    return 6;
  }
}
`,
  },
  {
    name: "Hello World",
    value: `
public class HelloWorldExample{
  public static void main(String args[]){
    System.out.println("Hello World !");
  }
}
`,
  },
  {
    name: "From lecture",
    value: `
public class LectureExample{
  int fib(int n)
  {
    int a = 0, b = 1, c, i;
    if (n < 2) return n;
    for (i = 1; i < n; i++)
    {
      c = a + b;
      a = b;
      b = c;
    }
    return c;
  }
}
`,
  },
];

window.addEventListener("load", () => {
  const codeEl = document.getElementById("code");
  const outputEl = document.getElementById("output");
  const graphEl = document.getElementById("graph");
  const codesEl = document.getElementById("codes");
  const loadCodeEl = document.getElementById("loadCode");
  const analyzeCodeEl = document.getElementById("analyzeCode");
  const methodsEl = document.getElementById("methods");
  const analyzeMethodEl = document.getElementById("analyzeMethod");

  for (const [i, code] of DEFAULT_CODES.entries()) {
    const codeEl = document.createElement("option");
    codeEl.value = i;
    codeEl.innerText = code.name;
    codesEl.appendChild(codeEl);
  }

  loadCodeEl.addEventListener(
    "click",
    () => (codeEl.value = DEFAULT_CODES[codesEl.value].value.trim())
  );

  analyzeCodeEl.addEventListener("click", () =>
    analyzeCode(codeEl, methodsEl, graphEl, outputEl)
  );
  analyzeMethodEl.addEventListener("click", () =>
    analyzeMethod(methods[methodsEl.value], graphEl, outputEl, codeEl)
  );
});

let ast = null;
let methods = [];

async function analyzeCode(code, methodsEl, graphEl, outputEl) {
  ast = javaParser.parse(code.value);
  console.log(ast);

  const builder = new BuildAst();
  builder.visit(ast);
  const types = builder.types;
  console.log(types);

  methods = types.flatMap((t) => {
    let meth;
    if (t.type == "normal") {
      console.log(t);
      meth = t.body.filter(Boolean).map((b) => ({
        ...b,
        name: `${t.name}.${b.name}`,
      }));
    } else {
      meth = [t];
    }
    return meth.filter((m) => m.type == "method");
  });

  methodsEl.innerText = "";
  for (const [i, method] of methods.entries()) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.innerText = method.name;
    methodsEl.appendChild(opt);
  }

  graphEl.value = JSON.stringify(types, null, 2);
}

async function analyzeMethod(method, graphEl, outputEl, codeEl) {
  outputEl.innerText = "";
  graphEl.value = "";

  console.log(method);
  const fnName = method.name;
  const args = method.parameters.map((p) => p.name);
  let statements = method.body;

  console.log(statements);

  let i = 1;
  const getId = () => i++;
  let parents = [
    {
      id: 0,
    },
  ];

  let nodes = [];
  let continues = [];
  let breaks = [];

  const variableStack = [new Map(args.map((a) => [a, [{ id: 0 }]]))];
  const getVar = (v) => {
    for (let i = variableStack.length - 1; i >= 0; i--) {
      if (variableStack[i].has(v)) {
        return variableStack[i].get(v);
      }
    }
    return [];
  };
  const setVar = (v, i) => {
    variableStack[variableStack.length - 1].set(v, i);
  };

  function processStatements(statements) {
    variableStack.push(new Map());

    const s = removeDeclarations(statements);

    for (const statement of s) {
      if (parents.length == 0) {
        // Unreachable code
        return variableStack.pop();
      }

      const dataParents = findUsedIdentifiers(statement).flatMap((i) =>
        getVar(i)
      );
      // console.log(statement);
      const { startOffset, endOffset } = statement.location;
      const currentId = getId();
      const node = {
        id: currentId,
        ast: statement,
        parents: parents,
        dataParents: dataParents,
        text: codeEl.value.slice(startOffset, endOffset + 1),
        type: "ordinary",
      };
      nodes.push(node);
      parents = [
        {
          id: currentId,
        },
      ];

      // If statement
      if (statement.name == "ifStatement") {
        const ifStatement = statement;
        // console.log(ifStatement);

        const expression = ifStatement.children.expression[0];
        const codePart = codeEl.value.slice(
          expression.location.startOffset,
          expression.location.endOffset + 1
        );

        node.ast = expression;
        node.type = "conditional";
        node.text = codePart;
        node.dataParents = findUsedIdentifiers(expression).flatMap((i) =>
          getVar(i)
        );

        let nextParents = [];
        let vars = [];
        for (const [i, part] of ifStatement.children.statement.entries()) {
          const statements = extractStatements(part);
          parents = [
            {
              text: i == 0 ? "true" : "false",
              id: currentId,
            },
          ];
          // console.log(statements);
          vars.push(processStatements(statements));
          nextParents = nextParents.concat(parents);
        }
        if (ifStatement.children.statement.length < 2) {
          nextParents.push({
            text: "false",
            id: currentId,
          });
        }
        parents = nextParents;
        for (const map of vars) {
          for (const entry of map.entries()) {
            setVar(entry[0], getVar(entry[0]).concat(entry[1]));
          }
        }
      } else if (statement.name == "forStatement") {
        // For statement
        if (statement.children.basicForStatement) {
          const basicForStatement = statement.children.basicForStatement[0];
          parents = nodes.pop().parents;

          if (basicForStatement.children.forInit) {
            const forInit = basicForStatement.children.forInit[0];
            const forInitId = getId();
            const dataParents = findUsedIdentifiers(forInit).flatMap((e) =>
              getVar(e)
            );
            nodes.push({
              id: forInitId,
              ast: forInit,
              dataParents: dataParents,
              parents: parents,
              text: codeEl.value.slice(
                forInit.location.startOffset,
                forInit.location.endOffset + 1
              ),
              type: "ordinary",
            });
            parents = [
              {
                id: forInitId,
              },
            ];

            if (
              forInit.children?.statementExpressionList
                ?.at(0)
                ?.children?.statementExpression?.at(0)
                ?.children?.expression?.at(0)
                ?.children?.conditionalExpression?.at(0)
                ?.children?.binaryExpression?.at(0)?.children
                ?.AssignmentOperator
            ) {
              const assignment = forInit.children.statementExpressionList
                .at(0)
                .children.statementExpression.at(0)
                .children.expression.at(0)
                .children.conditionalExpression.at(0)
                .children.binaryExpression.at(0);

              setVar(
                assignment.children.unaryExpression[0].children.primary[0]
                  .children.primaryPrefix[0].children.fqnOrRefType[0].children
                  .fqnOrRefTypePartFirst[0].children.fqnOrRefTypePartCommon[0]
                  .children.Identifier[0].image,
                [
                  {
                    id: forInitId,
                  },
                ]
              );
            }
          }

          let hasCond = false;
          let jumpTo = null;
          let next = nodes.length;

          if (basicForStatement.children.expression) {
            const expression = basicForStatement.children.expression[0];
            const expressionId = getId();
            const dataParents = findUsedIdentifiers(expression).flatMap((e) =>
              getVar(e)
            );
            const expressionNode = {
              id: expressionId,
              ast: expression,
              dataParents: dataParents,
              parents: parents,
              text: codeEl.value.slice(
                expression.location.startOffset,
                expression.location.endOffset + 1
              ),
              type: "conditional",
            };
            hasCond = true;
            jumpTo = expressionNode;
            nodes.push(expressionNode);
            parents = [
              {
                text: "true",
                id: expressionId,
              },
            ];
          }

          const statements = extractStatements(
            basicForStatement.children.statement
          );
          const tmpBreaks = breaks;
          const tmpContinues = continues;
          breaks = [];
          continues = [];
          let varMap = processStatements(statements);
          for (const entry of varMap.entries()) {
            setVar(entry[0], getVar(entry[0]).concat(entry[1]));
          }

          if (basicForStatement.children.forUpdate) {
            const forUpdate = basicForStatement.children.forUpdate[0];
            const forUpdateId = getId();
            const dataParents = findUsedIdentifiers(forUpdate).flatMap((e) =>
              getVar(e)
            );
            nodes.push({
              id: forUpdateId,
              ast: forUpdate,
              dataParents: dataParents,
              parents: parents,
              text: codeEl.value.slice(
                forUpdate.location.startOffset,
                forUpdate.location.endOffset + 1
              ),
              type: "conditional",
            });
            parents = [
              {
                id: forUpdateId,
              },
            ];
          }

          if (!jumpTo) {
            jumpTo = nodes[next];
          }
          jumpTo.parents = jumpTo.parents.concat(parents).concat(continues);

          if (hasCond) {
            parents = [
              {
                text: "false",
                id: jumpTo.id,
              },
            ];
          }
          parents = parents.concat(breaks);

          breaks = tmpBreaks;
          continues = tmpContinues;

          for (let i = next; i < nodes.length; i++) {
            const used = findUsedIdentifiers(nodes[i].ast).flatMap((i) =>
              getVar(i)
            );
            const filtered = used.filter((e) =>
              nodes[i].dataParents.every((a) => a.id != e.id)
            );
            nodes[i].dataParents = nodes[i].dataParents.concat(filtered);
          }
        }
      } else if (statement.name == "returnStatement") {
        parents = [];
      } else if (statement.name == "breakStatement") {
        breaks = breaks.concat(parents);
        parents = [];
      } else if (statement.name == "continueStatement") {
        continues = continues.concat(parents);
        parents = [];
      } else if (statement.name == "localVariableDeclarationStatement") {
        const decls =
          statement.children.localVariableDeclaration[0].children
            .variableDeclaratorList[0].children.variableDeclarator;
        // console.log(decls);
        parents = nodes.pop().parents;
        for (const decl of decls) {
          if (decl.children.variableInitializer) {
            const declId = getId();
            const dataParents = findUsedIdentifiers(
              decl.children.variableInitializer
            ).flatMap((e) => getVar(e));
            nodes.push({
              id: declId,
              ast: decl.children.variableInitializer,
              dataParents: dataParents,
              parents: parents,
              text: codeEl.value.slice(
                decl.location.startOffset,
                decl.location.endOffset + 1
              ),
              type: "ordinary",
            });
            setVar(
              decl.children.variableDeclaratorId[0].children.Identifier[0]
                .image,
              [
                {
                  id: declId,
                },
              ]
            );

            parents = [
              {
                id: declId,
              },
            ];
          }
        }
      } else if (
        statement.children?.conditionalExpression
          ?.at(0)
          ?.children?.binaryExpression?.at(0)?.children?.AssignmentOperator
      ) {
        const assignment = statement.children.conditionalExpression
          .at(0)
          .children?.binaryExpression?.at(0);
        setVar(
          assignment.children.unaryExpression[0].children.primary[0].children
            .primaryPrefix[0].children.fqnOrRefType[0].children
            .fqnOrRefTypePartFirst[0].children.fqnOrRefTypePartCommon[0]
            .children.Identifier[0].image,
          [
            {
              id: currentId,
            },
          ]
        );
      } else {
        // Simple statement
      }
    }
    return variableStack.pop();
  }

  processStatements(statements);

  let flowchartCode = `flowchart TD\n`;

  flowchartCode += `0("\`${fnName}(${args.join(", ")})\`")\n`;

  console.log(nodes);
  for (const node of nodes) {
    switch (node.type) {
      case "ordinary":
        flowchartCode += `${node.id}["\`${node.text.replace(
          /"/g,
          "#quot;"
        )}\`"]\n`;
        break;
      case "conditional":
        flowchartCode += `${node.id}{"\`${node.text.replace(
          /"/g,
          "#quot;"
        )}\`"}\n`;
        break;
    }

    flowchartCode += node.parents
      .map(
        (parentNode) =>
          `${parentNode.id} ==>${
            parentNode.text ? `|${parentNode.text}|` : ""
          } ${node.id}\n`
      )
      .join("");

    flowchartCode += node.dataParents
      .map(
        (parentNode) =>
          `${parentNode.id} -.->${
            parentNode.text ? `|${parentNode.text}|` : ""
          } ${node.id}\n`
      )
      .join("");
  }

  graphEl.value = flowchartCode;
  const { svg, bindFunctions } = await mermaid.render("ast", flowchartCode);
  outputEl.innerHTML = svg;
  bindFunctions?.(outputEl);
}

function removeDeclarations(s) {
  return s.flatMap((s) => {
    if (s.type != "declaration") {
      return [s];
    }
    return s.declaration.variables.flatMap((v) => {
      if (!v.init) return [];

      return [
        {
          type: "statement",
          statement: {
            type: "expression",
            expression: {
              type: "assignment",
              op: "=",
              left: {
                type: "fqn",
                fqn: [v.name],
              },
              right: v.init,
            },
          },
        },
      ];
    });
  });
}

class StatementsExtractor extends javaParser.BaseJavaCstVisitorWithDefaults {
  constructor() {
    super();
    this.customResult = [];
    this.validateVisitor();
  }

  statementWithoutTrailingSubstatement(ctx) {
    if (ctx.block) {
      this.visit(ctx.block);
    } else {
      // console.log(`Single statement found`);
      this.customResult = Object.values(ctx)[0];
    }
  }

  blockStatements(ctx) {
    // console.log("Block statements found");
    this.customResult = ctx.blockStatement;
  }
}

function extractStatements(ast) {
  const extractor = new StatementsExtractor();
  extractor.visit(ast);
  return extractor.customResult;
}

function unwrapStatement(ast) {
  if (
    ast.name == "blockStatement" ||
    ast.name == "statementWithoutTrailingSubstatement" ||
    ast.name == "statement" ||
    ast.name == "statementExpression" ||
    ast.name == "expressionStatement"
  ) {
    return unwrapStatement(Object.values(ast.children)[0][0]);
  }
  return ast;
}

class UsedIdentifierExtractor extends javaParser.BaseJavaCstVisitorWithDefaults {
  constructor() {
    super();
    this.customResult = [];
    this.validateVisitor();
  }

  binaryExpression(ctx) {
    if (ctx.AssignmentOperator) {
      this.visit(ctx.expression);
    } else {
      Object.values(ctx)
        .flat()
        .forEach((data) => data.name && this.visit(data));
    }
  }

  fqnOrRefType(ctx) {
    const name =
      ctx.fqnOrRefTypePartFirst[0].children.fqnOrRefTypePartCommon[0].children
        .Identifier[0].image;
    this.customResult.push(name);
  }
}

function findUsedIdentifiers(ast) {
  const extractor = new UsedIdentifierExtractor();
  extractor.visit(ast);
  return extractor.customResult;
}

class BuildAst extends javaParser.BaseJavaCstVisitor {
  constructor() {
    super();
    this.types = [];
    this.validateVisitor();
  }

  visit(to) {
    if (!to) {
      throw new Error("Visit undefined");
    }
    return super.visit(to);
  }

  compilationUnit(ctx) {
    if (ctx.ordinaryCompilationUnit) {
      this.visit(ctx.ordinaryCompilationUnit);
    }
    // Not interested in modular compilation unit
  }

  ordinaryCompilationUnit(ctx) {
    // Not interested in package declaration
    // Not interestef in import declaration
    for (const type of ctx.typeDeclaration) {
      this.types.push(this.visit(type));
      // TODO
    }
  }

  typeDeclaration(ctx) {
    if (ctx.Semicolon) {
      return null;
    }

    if (ctx.classDeclaration) {
      return this.visit(ctx.classDeclaration);
    }

    if (ctx.interfaceDeclaration) {
      return this.visit(ctx.interfaceDeclaration);
    }

    if (ctx.fieldDeclaraion) {
      return this.visit(ctx.fieldDeclaraion);
    }

    if (ctx.methodDeclaration) {
      return this.visit(ctx.methodDeclaration);
    }
  }

  classDeclaration(ctx) {
    // Not interested in modifiers
    if (ctx.normalClassDeclaration) {
      return {
        type: "normal",
        ...this.visit(ctx.normalClassDeclaration),
      };
    }

    if (ctx.enumDeclaration) {
      return {
        type: "enum",
        ...this.visit(ctx.enumDeclaration),
      };
    }

    if (ctx.recordDeclaration) {
      return {
        type: "record",
        ...this.visit(ctx.recordDeclaration),
      };
    }
  }

  normalClassDeclaration(ctx) {
    const name = this.visit(ctx.typeIdentifier);
    const typeParameters = ctx.typeParameters
      ? this.visit(ctx.typeParameters)
      : [];
    // const extends_ = ctx.classExtends ? this.visit(ctx.classExtends) : null
    // const implements_ = ctx.classImplements ? this.visit(ctx.classImplements) : []
    // Not interested in permits
    const body = this.visit(ctx.classBody);

    return {
      name,
      typeParameters,
      body,
    };
  }

  typeParameters(ctx) {
    return ctx.visit(ctx.typeParameterList);
  }

  typeParameterList(ctx) {
    return ctx.typeParameter.map((par) => this.visit(par));
  }

  classExtends(ctx) {
    return this.visit(ctx.classType);
  }

  classImplements(ctx) {
    return this.visit(ctx.interfaceTypeList);
  }

  interfaceTypeList(ctx) {
    return ctx.interfaceType.map((i) => this.visit(i));
  }

  classBody(ctx) {
    return (ctx.classBodyDeclaration ?? []).map((d) => this.visit(d));
  }

  classBodyDeclaration(ctx) {
    if (ctx.classMemberDeclaration) {
      return this.visit(ctx.classMemberDeclaration);
    }

    // Not interested in not methods
    return null;
  }

  classMemberDeclaration(ctx) {
    if (ctx.methodDeclaration) {
      return this.visit(ctx.methodDeclaration);
    }

    if (ctx.classDeclaration) {
      return this.visit(ctx.classDeclaration);
    }

    if (ctx.interfaceDeclaration) {
      return this.visit(ctx.interfaceDeclaration);
    }

    // Not interested in not methods
    return null;
  }

  variableDeclaratorList(ctx) {
    return ctx.variableDeclarator.map((v) => this.visit(v));
  }

  variableDeclarator(ctx) {
    const id = this.visit(ctx.variableDeclaratorId);
    if (ctx.variableInitializer) {
      return {
        id,
        init: this.visit(ctx.variableInitializer),
      };
    }
    return {
      id,
    };
  }

  variableDeclaratorId(ctx) {
    if (ctx.Identifier) {
      // Ignore dims
      return ctx.Identifier[0].image;
    }

    if (ctx.Underscore) {
      return "_";
    }
  }

  variableInitializer(ctx) {
    if (ctx.expression) {
      return this.visit(ctx.expression);
    }

    // Not interested in array initializer
    throw new Error("Not implemented");
  }

  unannType(ctx) {
    if (ctx.unannPrimitiveTypeWithOptionalDimsSuffix) {
      return this.visit(ctx.unannPrimitiveTypeWithOptionalDimsSuffix);
    }

    if (ctx.unannReferenceType) {
      return this.visit(ctx.unannReferenceType);
    }
  }

  unannPrimitiveTypeWithOptionalDimsSuffix(ctx) {
    return this.visit(ctx.unannPrimitiveType);
    // Ignore dims
  }

  unannPrimitiveType(ctx) {
    if (ctx.numericType) {
      return this.visit(ctx.numericType);
    }

    if (ctx.Boolean) {
      return ["boolean"];
    }
  }

  unannReferenceType(ctx) {
    return this.visit(ctx.unannClassOrInterfaceType);
    // Ignore dims
  }

  unannClassOrInterfaceType(ctx) {
    return this.visit(ctx.unannClassType);
  }

  unannClassType(ctx) {
    // Hard to differentiate between type arguments, let's ignore them
    return ctx.Identifier.map((i) => i.image);
  }

  methodDeclaration(ctx) {
    // Ignore modifiers
    return {
      type: "method",
      ...this.visit(ctx.methodHeader),
      ...this.visit(ctx.methodBody),
    };
  }

  methodHeader(ctx) {
    // Ignore type parameters
    console.log(ctx);
    const result = this.visit(ctx.result);
    const declarator = this.visit(ctx.methodDeclarator);
    // Ignore throws
    return {
      result,
      ...declarator,
    };
  }

  result(ctx) {
    if (ctx.unannType) {
      return this.visit(ctx.unannType);
    }

    if (ctx.Void) {
      return "void";
    }
  }

  methodDeclarator(ctx) {
    const name = ctx.Identifier[0].image;
    // Ignore receiver parameter
    const parameters = ctx.formalParameterList
      ? this.visit(ctx.formalParameterList)
      : [];
    // Ignore dims
    return { name, parameters };
  }

  formalParameterList(ctx) {
    return ctx.formalParameter.map((p) => this.visit(p));
  }

  formalParameter(ctx) {
    if (ctx.variableParaRegularParameter) {
      return this.visit(ctx.variableParaRegularParameter);
    }
    // Ignore variable arity parameters
  }

  variableParaRegularParameter(ctx) {
    // Ignore modifiers
    const type = this.visit(ctx.unannType);
    const name = this.visit(ctx.variableDeclaratorId);
    return { name, type };
  }

  methodBody(ctx) {
    if (ctx.block) {
      return { body: this.visit(ctx.block) };
    }

    if (ctx.Semicolon) {
      return [];
    }
  }

  block(ctx) {
    return ctx.blockStatements ? this.visit(ctx.blockStatements) : [];
  }

  blockStatements(ctx) {
    return ctx.blockStatement.map((b) => this.visit(b));
  }

  blockStatement(ctx) {
    if (ctx.localVariableDeclarationStatement) {
      return {
        type: "declaration",
        declaration: this.visit(ctx.localVariableDeclarationStatement),
      };
    }

    // Ignore nested classes interfaces

    if (ctx.statement) {
      return {
        type: "statement",
        statement: this.visit(ctx.statement),
      };
    }
  }

  localVariableDeclarationStatement(ctx) {
    return this.visit(ctx.localVariableDeclaration);
  }

  localVariableDeclaration(ctx) {
    // Ignore modifier
    const type = this.visit(ctx.localVariableType);
    const variables = this.visit(ctx.variableDeclaratorList);
    return {
      type,
      variables,
    };
  }

  localVariableType(ctx) {
    if (ctx.unannType) {
      return this.visit(ctx.unannType);
    }

    if (ctx.Var) {
      return ["var"];
    }
  }

  statement(ctx) {
    if (ctx.statementWithoutTrailingSubstatement) {
      return this.visit(ctx.statementWithoutTrailingSubstatement);
    }

    if (ctx.labeledStatement) {
      return this.visit(ctx.labeledStatement);
    }

    if (ctx.ifStatement) {
      return this.visit(ctx.ifStatement);
    }

    if (ctx.whileStatement) {
      return this.visit(ctx.whileStatement);
    }

    if (ctx.forStatement) {
      return this.visit(ctx.forStatement);
    }
  }

  statementWithoutTrailingSubstatement(ctx) {
    if (ctx.block) {
      return {
        type: "block",
        block: this.visit(ctx.block),
      };
    }

    // Ignore yield

    if (ctx.emptyStatement) {
      return null;
    }

    if (ctx.expressionStatement) {
      return this.visit(ctx.expressionStatement);
    }

    // Ignore assert statement

    if (ctx.switchStatement) {
      return this.visit(ctx.switchStatement);
    }

    if (ctx.doStatement) {
      return this.visit(ctx.doStatement);
    }

    if (ctx.breakStatement) {
      return this.visit(ctx.breakStatement);
    }

    if (ctx.continueStatement) {
      return this.visit(ctx.continueStatement);
    }

    if (ctx.returnStatement) {
      return this.visit(ctx.returnStatement);
    }

    // Ignore synchronized, throw, try/catch
  }

  labeledStatement(ctx) {
    const label = this.visit(ctx.Identifier);
    const statement = this.visit(ctx.statement);
    return { label, ...statement };
  }

  expressionStatement(ctx) {
    return this.visit(ctx.statementExpression);
  }

  statementExpression(ctx) {
    return {
      type: "expression",
      expression: this.visit(ctx.expression),
    };
  }

  ifStatement(ctx) {
    const cond = this.visit(ctx.expression);
    const then = this.visit(ctx.statement[0]);
    const otherwise =
      ctx.statement.length > 1 ? this.visit(ctx.statement[1]) : null;
    return {
      type: "if",
      cond,
      then,
      otherwise,
    };
  }

  switchStatement(ctx) {
    const expression = this.visit(ctx.expression);
    const cases = this.visit(ctx.switchBlock);
    return {
      type: "switch",
      expression,
      cases,
    };
  }

  switchBlock(ctx) {
    // Ignore switch rules
    if (ctx.switchBlockStatementGroup) {
      return this.visit(ctx.switchBlockStatementGroup);
    }
  }

  switchBlockStatementGroup(ctx) {
    const label = this.visit(ctx.switchLabel);
    const block = ctx.blockStatements ? this.visit(ctx.blockStatements) : null;
    return { label, block };
  }

  switchLabel(ctx) {
    if (ctx.Case) {
      // Ignore all cases except constants
      return {
        type: "constant",
        constants: ctx.caseConstant.map((c) => this.visit(c)),
      };
    }

    if (ctx.Default) {
      return {
        type: "default",
      };
    }
  }

  caseConstant(ctx) {
    return this.visit(ctx.conditionalExpression);
  }

  whileStatement(ctx) {
    const cond = this.visit(ctx.expression);
    const statement = this.visit(ctx.statement);
    return { type: "while", cond, statement };
  }

  doStatement(ctx) {
    const cond = this.visit(ctx.expression);
    const statement = this.visit(ctx.statement);
    return { type: "do", cond, statement };
  }

  forStatement(ctx) {
    if (ctx.basicForStatement) {
      return this.visit(ctx.basicForStatement);
    }

    // Ignore extended form
  }

  basicForStatement(ctx) {
    const init = ctx.forInit ? this.visit(ctx.forInit) : null;
    const cond = ctx.expression ? this.visit(ctx.expression) : null;
    const update = ctx.forUpdate ? this.visit(ctx.forUpdate) : null;
    return {
      type: "basicFor",
      init,
      cond,
      update,
    };
  }

  forInit(ctx) {
    if (ctx.localVariableDeclaration) {
      return this.visit(ctx.localVariableDeclaration);
    }

    if (ctx.statementExpressionList) {
      return this.visit(ctx.statementExpressionList);
    }
  }

  forUpdate(ctx) {
    return this.visit(ctx.statementExpressionList);
  }

  statementExpressionList(ctx) {
    return ctx.statementExpression.map((s) => this.visit(s));
  }

  breakStatement(ctx) {
    const to = ctx.Identifier ? ctx.Identifier[0].image : null;
    return { type: "break", to };
  }

  continueStatement(ctx) {
    const to = ctx.Identifier ? ctx.Identifier[0].image : null;
    return { type: "continue", to };
  }

  returnStatement(ctx) {
    const expression = ctx.expression ? this.visit(ctx.expression) : null;
    return { type: "return", expression };
  }

  literal(ctx) {
    if (ctx.integerLiteral) {
      return this.visit(ctx.integerLiteral);
    }

    if (ctx.floatingPointLiteral) {
      return this.visit(ctx.floatingPointLiteral);
    }

    if (ctx.booleanLiteral) {
      return this.visit(ctx.booleanLiteral);
    }

    if (ctx.CharLiteral) {
      return {
        type: "literal",
        literal: "char",
        image: ctx.CharLiteral[0].image,
      };
    }

    if (ctx.TextBlock) {
      return {
        type: "literal",
        literal: "textblock",
        image: ctx.TextBlock[0].image,
      };
    }

    if (ctx.StringLiteral) {
      return {
        type: "literal",
        literal: "string",
        image: ctx.StringLiteral[0].image,
      };
    }

    if (ctx.Null) {
      return {
        type: "literal",
        literal: "null",
        image: null,
      };
    }
  }

  integerLiteral(ctx) {
    let image = null;

    if (ctx.DecimalLiteral) {
      image = ctx.DecimalLiteral[0].image;
    }

    if (ctx.HexLiteral) {
      image = ctx.HexLiteral[0].image;
    }

    if (ctx.OctalLiteral) {
      image = ctx.OctalLiteral[0].image;
    }

    if (ctx.BinaryLiteral) {
      image = ctx.BinaryLiteral[0].image;
    }

    return {
      type: "literal",
      literal: "integer",
      image,
    };
  }

  floatingPointLiteral(ctx) {
    if (ctx.FloatLiteral) {
      return {
        type: "literal",
        literal: "float",
        image: ctx.FloatLiteral[0].image,
      };
    }

    if (ctx.HexFloatLiteral) {
      return {
        type: "literal",
        literal: "float",
        image: ctx.HexFloatLiteral[0].image,
      };
    }
  }

  booleanLiteral(ctx) {
    return {
      type: "literal",
      literal: "boolean",
      image: (ctx.True ?? ctx.False)[0].image,
    };
  }

  moduleName(ctx) {
    return ctx.Identifier.map((i) => i.image);
  }

  packageName(ctx) {
    return ctx.Identifier.map((i) => i.image);
  }

  typeName(ctx) {
    return ctx.Identifier.map((i) => i.image);
  }

  expressionName(ctx) {
    return ctx.Identifier.map((i) => i.image);
  }

  methodName(ctx) {
    return ctx.Identifier[0].image;
  }

  packageOrTypeName(ctx) {
    return ctx.Identifier.map((i) => i.image);
  }

  ambiguousName(ctx) {
    return ctx.Identifier.map((i) => i.image);
  }

  expression(ctx) {
    // Not interested in lambdas
    if (ctx.conditionalExpression) {
      return this.visit(ctx.conditionalExpression);
    }
  }

  conditionalExpression(ctx) {
    if (ctx.QuestionMark) {
      return {
        type: "ternary",
        cond: this.visit(ctx.binaryExpression),
        then: this.visit(ctx.expression[0]),
        otherwise: this.visit(ctx.expression[1]),
      };
    }

    return this.visit(ctx.binaryExpression);
  }

  binaryExpression(ctx) {
    // Ignore instanceof
    if (ctx.AssignmentOperator) {
      return {
        type: "assignment",
        op: ctx.AssignmentOperator[0].image,
        left: this.visit(ctx.unaryExpression[0]),
        right: this.visit(ctx.expression),
      };
    }

    if (ctx.unaryExpression.length > 1) {
      // This won't work with shifts operators
      return {
        type: "binary",
        ops: ctx.BinaryOperator.concat(ctx.Less ?? [])
          .concat(ctx.Greater ?? [])
          .sort((a, b) => a.startOffset - b.startOffset)
          .map((e) => e.image),
        exps: ctx.unaryExpression.map((u) => this.visit(u)),
      };
    }

    return this.visit(ctx.unaryExpression[0]);
  }

  unaryExpression(ctx) {
    const pre = ctx.UnaryPrefixOperator
      ? ctx.UnaryPrefixOperator.map((u) => u.image)
      : [];
    const post = ctx.UnarySuffixOperator
      ? ctx.UnarySuffixOperator.map((u) => u.image)
      : [];
    const primary = this.visit(ctx.primary);

    if (pre.length > 0 || post.length > 0) {
      return {
        type: "unary",
        pre,
        post,
        exp: primary,
      };
    }

    return primary;
  }

  primary(ctx) {
    // Ignore suffix
    return this.visit(ctx.primaryPrefix);
  }

  primaryPrefix(ctx) {
    // Not interested in rest
    if (ctx.literal) {
      return this.visit(ctx.literal);
    }

    if (ctx.fqnOrRefType) {
      return this.visit(ctx.fqnOrRefType);
    }

    if (ctx.parenthesisExpression) {
      return this.visit(ctx.parenthesisExpression);
    }
  }

  parenthesisExpression(ctx) {
    return this.visit(ctx.expression);
  }

  fqnOrRefType(ctx) {
    const first = this.visit(ctx.fqnOrRefTypePartFirst);
    const rest = ctx.fqnOrRefTypePartRest
      ? ctx.fqnOrRefTypePartRest.map((p) => this.visit(p))
      : [];
    return {
      type: "fqn",
      fqn: [first].concat(rest),
    };
  }

  fqnOrRefTypePartRest(ctx) {
    // Ignore rest
    return this.visit(ctx.fqnOrRefTypePartCommon);
  }

  fqnOrRefTypePartCommon(ctx) {
    // Ignore rest
    return ctx.Identifier[0].image;
  }

  fqnOrRefTypePartFirst(ctx) {
    // Ignore rest
    return this.visit(ctx.fqnOrRefTypePartCommon);
  }

  typeIdentifier(ctx) {
    return ctx.Identifier[0].image;
  }

  numericType(ctx) {
    if (ctx.integralType) {
      return this.visit(ctx.integralType);
    }

    if (ctx.floatingPointType) {
      return this.visit(ctx.floatingPointType);
    }
  }

  integralType(ctx) {
    if (ctx.Byte) {
      return ctx.Byte[0].image;
    }

    if (ctx.Short) {
      return ctx.Short[0].image;
    }

    if (ctx.Int) {
      return ctx.Int[0].image;
    }

    if (ctx.Long) {
      return ctx.Long[0].image;
    }

    if (ctx.Char) {
      return ctx.Char[0].image;
    }
  }

  floatingPointType() {
    if (ctx.Float) {
      return ctx.Float[0].image;
    }

    if (ctx.Byte) {
      return ctx.Double[0].image;
    }
  }

  // Unimplemented
  primitiveType() {
    throw new Error("Not implemented");
  }
  referenceType() {
    throw new Error("Not implemented");
  }
  classOrInterfaceType() {
    throw new Error("Not implemented");
  }
  classType() {
    throw new Error("Not implemented");
  }
  interfaceType() {
    throw new Error("Not implemented");
  }
  typeVariable() {
    throw new Error("Not implemented");
  }
  dims() {
    throw new Error("Not implemented");
  }
  typeParameter() {
    throw new Error("Not implemented");
  }
  typeParameterModifier() {
    throw new Error("Not implemented");
  }
  typeBound() {
    throw new Error("Not implemented");
  }
  additionalBound() {
    throw new Error("Not implemented");
  }
  typeArguments() {
    throw new Error("Not implemented");
  }
  typeArgumentList() {
    throw new Error("Not implemented");
  }
  typeArgument() {
    throw new Error("Not implemented");
  }
  wildcard() {
    throw new Error("Not implemented");
  }
  wildcardBounds() {
    throw new Error("Not implemented");
  }
  classModifier() {
    throw new Error("Not implemented");
  }
  classPermits() {
    throw new Error("Not implemented");
  }
  fieldDeclaration() {
    throw new Error("Not implemented");
  }
  fieldModifier() {
    throw new Error("Not implemented");
  }
  unannInterfaceType() {
    throw new Error("Not implemented");
  }
  unannTypeVariable() {
    throw new Error("Not implemented");
  }
  methodModifier() {
    throw new Error("Not implemented");
  }
  receiverParameter() {
    throw new Error("Not implemented");
  }
  variableArityParameter() {
    throw new Error("Not implemented");
  }
  variableModifier() {
    throw new Error("Not implemented");
  }
  throws() {
    throw new Error("Not implemented");
  }
  exceptionTypeList() {
    throw new Error("Not implemented");
  }
  exceptionType() {
    throw new Error("Not implemented");
  }
  instanceInitializer() {
    throw new Error("Not implemented");
  }
  staticInitializer() {
    throw new Error("Not implemented");
  }
  constructorDeclaration() {
    throw new Error("Not implemented");
  }
  constructorModifier() {
    throw new Error("Not implemented");
  }
  constructorDeclarator() {
    throw new Error("Not implemented");
  }
  simpleTypeName() {
    throw new Error("Not implemented");
  }
  constructorBody() {
    throw new Error("Not implemented");
  }
  explicitConstructorInvocation() {
    throw new Error("Not implemented");
  }
  unqualifiedExplicitConstructorInvocation() {
    throw new Error("Not implemented");
  }
  qualifiedExplicitConstructorInvocation() {
    throw new Error("Not implemented");
  }
  enumDeclaration() {
    throw new Error("Not implemented");
  }
  enumBody() {
    throw new Error("Not implemented");
  }
  enumConstantList() {
    throw new Error("Not implemented");
  }
  enumConstant() {
    throw new Error("Not implemented");
  }
  enumConstantModifier() {
    throw new Error("Not implemented");
  }
  enumBodyDeclarations() {
    throw new Error("Not implemented");
  }
  recordDeclaration() {
    throw new Error("Not implemented");
  }
  recordHeader() {
    throw new Error("Not implemented");
  }
  recordComponentList() {
    throw new Error("Not implemented");
  }
  recordComponent() {
    throw new Error("Not implemented");
  }
  variableArityRecordComponent() {
    throw new Error("Not implemented");
  }
  recordComponentModifier() {
    throw new Error("Not implemented");
  }
  recordBody() {
    throw new Error("Not implemented");
  }
  recordBodyDeclaration() {
    throw new Error("Not implemented");
  }
  compactConstructorDeclaration() {
    throw new Error("Not implemented");
  }
  isDims() {
    throw new Error("Not implemented");
  }
  modularCompilationUnit() {
    throw new Error("Not implemented");
  }
  packageDeclaration() {
    throw new Error("Not implemented");
  }
  packageModifier() {
    throw new Error("Not implemented");
  }
  importDeclaration() {
    throw new Error("Not implemented");
  }
  moduleDeclaration() {
    throw new Error("Not implemented");
  }
  moduleDirective() {
    throw new Error("Not implemented");
  }
  requiresModuleDirective() {
    throw new Error("Not implemented");
  }
  exportsModuleDirective() {
    throw new Error("Not implemented");
  }
  opensModuleDirective() {
    throw new Error("Not implemented");
  }
  usesModuleDirective() {
    throw new Error("Not implemented");
  }
  providesModuleDirective() {
    throw new Error("Not implemented");
  }
  requiresModifier() {
    throw new Error("Not implemented");
  }
  interfaceDeclaration() {
    throw new Error("Not implemented");
  }
  normalInterfaceDeclaration() {
    throw new Error("Not implemented");
  }
  interfaceModifier() {
    throw new Error("Not implemented");
  }
  interfaceExtends() {
    throw new Error("Not implemented");
  }
  interfacePermits() {
    throw new Error("Not implemented");
  }
  interfaceBody() {
    throw new Error("Not implemented");
  }
  interfaceMemberDeclaration() {
    throw new Error("Not implemented");
  }
  constantDeclaration() {
    throw new Error("Not implemented");
  }
  constantModifier() {
    throw new Error("Not implemented");
  }
  interfaceMethodDeclaration() {
    throw new Error("Not implemented");
  }
  interfaceMethodModifier() {
    throw new Error("Not implemented");
  }
  annotationInterfaceDeclaration() {
    throw new Error("Not implemented");
  }
  annotationInterfaceBody() {
    throw new Error("Not implemented");
  }
  annotationInterfaceMemberDeclaration() {
    throw new Error("Not implemented");
  }
  annotationInterfaceElementDeclaration() {
    throw new Error("Not implemented");
  }
  annotationInterfaceElementModifier() {
    throw new Error("Not implemented");
  }
  defaultValue() {
    throw new Error("Not implemented");
  }
  annotation() {
    throw new Error("Not implemented");
  }
  elementValuePairList() {
    throw new Error("Not implemented");
  }
  elementValuePair() {
    throw new Error("Not implemented");
  }
  elementValue() {
    throw new Error("Not implemented");
  }
  elementValueArrayInitializer() {
    throw new Error("Not implemented");
  }
  elementValueList() {
    throw new Error("Not implemented");
  }
  arrayInitializer() {
    throw new Error("Not implemented");
  }
  variableInitializerList() {
    throw new Error("Not implemented");
  }
  emptyStatement() {
    throw new Error("Not implemented");
  }
  assertStatement() {
    throw new Error("Not implemented");
  }
  switchRule() {
    throw new Error("Not implemented");
  }
  casePattern() {
    throw new Error("Not implemented");
  }
  enhancedForStatement() {
    throw new Error("Not implemented");
  }
  throwStatement() {
    throw new Error("Not implemented");
  }
  synchronizedStatement() {
    throw new Error("Not implemented");
  }
  tryStatement() {
    throw new Error("Not implemented");
  }
  catches() {
    throw new Error("Not implemented");
  }
  catchClause() {
    throw new Error("Not implemented");
  }
  catchFormalParameter() {
    throw new Error("Not implemented");
  }
  catchType() {
    throw new Error("Not implemented");
  }
  finally() {
    throw new Error("Not implemented");
  }
  tryWithResourcesStatement() {
    throw new Error("Not implemented");
  }
  resourceSpecification() {
    throw new Error("Not implemented");
  }
  resourceList() {
    throw new Error("Not implemented");
  }
  resource() {
    throw new Error("Not implemented");
  }
  yieldStatement() {
    throw new Error("Not implemented");
  }
  variableAccess() {
    throw new Error("Not implemented");
  }
  lambdaExpression() {
    throw new Error("Not implemented");
  }
  lambdaParameters() {
    throw new Error("Not implemented");
  }
  lambdaParametersWithBraces() {
    throw new Error("Not implemented");
  }
  lambdaParameterList() {
    throw new Error("Not implemented");
  }
  conciseLambdaParameterList() {
    throw new Error("Not implemented");
  }
  normalLambdaParameterList() {
    throw new Error("Not implemented");
  }
  normalLambdaParameter() {
    throw new Error("Not implemented");
  }
  regularLambdaParameter() {
    throw new Error("Not implemented");
  }
  lambdaParameterType() {
    throw new Error("Not implemented");
  }
  conciseLambdaParameter() {
    throw new Error("Not implemented");
  }
  lambdaBody() {
    throw new Error("Not implemented");
  }
  unaryExpressionNotPlusMinus() {
    throw new Error("Not implemented");
  }
  primarySuffix() {
    throw new Error("Not implemented");
  }
  castExpression() {
    throw new Error("Not implemented");
  }
  primitiveCastExpression() {
    throw new Error("Not implemented");
  }
  referenceTypeCastExpression() {
    throw new Error("Not implemented");
  }
  newExpression() {
    throw new Error("Not implemented");
  }
  unqualifiedClassInstanceCreationExpression() {
    throw new Error("Not implemented");
  }
  classOrInterfaceTypeToInstantiate() {
    throw new Error("Not implemented");
  }
  typeArgumentsOrDiamond() {
    throw new Error("Not implemented");
  }
  diamond() {
    throw new Error("Not implemented");
  }
  methodInvocationSuffix() {
    throw new Error("Not implemented");
  }
  argumentList() {
    throw new Error("Not implemented");
  }
  arrayCreationExpression() {
    throw new Error("Not implemented");
  }
  arrayCreationExpressionWithoutInitializerSuffix() {
    throw new Error("Not implemented");
  }
  arrayCreationWithInitializerSuffix() {
    throw new Error("Not implemented");
  }
  dimExprs() {
    throw new Error("Not implemented");
  }
  dimExpr() {
    throw new Error("Not implemented");
  }
  classLiteralSuffix() {
    throw new Error("Not implemented");
  }
  arrayAccessSuffix() {
    throw new Error("Not implemented");
  }
  methodReferenceSuffix() {
    throw new Error("Not implemented");
  }
  templateArgument() {
    throw new Error("Not implemented");
  }
  template() {
    throw new Error("Not implemented");
  }
  stringTemplate() {
    throw new Error("Not implemented");
  }
  textBlockTemplate() {
    throw new Error("Not implemented");
  }
  embeddedExpression() {
    throw new Error("Not implemented");
  }
  pattern() {
    throw new Error("Not implemented");
  }
  typePattern() {
    throw new Error("Not implemented");
  }
  recordPattern() {
    throw new Error("Not implemented");
  }
  componentPatternList() {
    throw new Error("Not implemented");
  }
  componentPattern() {
    throw new Error("Not implemented");
  }
  matchAllPattern() {
    throw new Error("Not implemented");
  }
  guard() {
    throw new Error("Not implemented");
  }
  isRefTypeInMethodRef() {
    throw new Error("Not implemented");
  }
}
