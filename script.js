import * as javaParser from "https://esm.run/java-parser";
import mermaid from "https://esm.run/mermaid";

mermaid.initialize();

const DEFAULT_CODES = [
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
    analyzeMethod(methods[methodsEl.value].value, graphEl, outputEl, codeEl)
  );
});

let ast = null;
let methods = [];

class MethodsFinder extends javaParser.BaseJavaCstVisitorWithDefaults {
  constructor() {
    super();
    this.customResult = [];
    this.validateVisitor();
  }

  methodDeclaration(ctx) {
    this.customResult.push(ctx);
  }
}

async function analyzeCode(code, methodsEl, graphEl, outputEl) {
  ast = javaParser.parse(code.value);

  const methodsFinder = new MethodsFinder();
  methodsFinder.visit(ast);
  methods = methodsFinder.customResult.map((method) => ({
    name: method.methodHeader[0].children.methodDeclarator[0].children
      .Identifier[0].image,
    value: method,
  }));

  methodsEl.innerText = "";
  for (const [i, method] of methods.entries()) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.innerText = method.name;
    methodsEl.appendChild(opt);
  }

  let flowchartCode = `flowchart TD\n`;
  let stack = [
    {
      parentId: 0,
      parent: "",
      node: ast,
    },
  ];
  let i = 0;
  while (stack.length != 0) {
    const { node, parent, parentId } = stack.shift();

    const current = `${parent}.${node.name}`;
    const currentId = i++;
    const name = node.name ?? (node.image || `EMPTY`);
    flowchartCode += `${currentId}["${name.replace(/"/g, "#quot;")}"]\n`;
    if (parent) {
      flowchartCode += `${parentId} --> ${currentId}\n`;
    }
    if (!("tokenType" in node)) {
      stack = stack.concat(
        Object.values(node.children)
          .flat()
          .map((node) => ({ node, parent: current, parentId: currentId }))
      );
    }
  }

  graphEl.value = flowchartCode;
  return;
  const { svg, bindFunctions } = await mermaid.render("ast", flowchartCode);
  outputEl.innerHTML = svg;
  bindFunctions?.(outputEl);
}

async function analyzeMethod(method, graphEl, outputEl, codeEl) {
  outputEl.innerText = "";
  graphEl.value = "";

  const fnName =
    method.methodHeader[0].children.methodDeclarator[0].children.Identifier[0]
      .image;
  const args =
    method.methodHeader[0].children.methodDeclarator[0].children.formalParameterList[0].children.formalParameter.map(
      (p) =>
        p.children.variableParaRegularParameter[0].children
          .variableDeclaratorId[0].children.Identifier[0].image
    );
  console.log(args);
  const statements = extractStatements(method.methodBody);

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

    for (const _statement of statements) {
      if (parents.length == 0) {
        // Unreachable code
        variableStack.pop();
        return;
      }
      const statement = unwrapStatement(_statement);
      const dataParents = findUsedIdentifiers(statement).flatMap((i) =>
        getVar(i)
      );
      // console.log(statement);
      const { startOffset, endOffset } = statement.location;
      const currentId = getId();
      const node = {
        id: currentId,
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

        node.type = "conditional";
        node.text = codePart;
        node.dataParents = findUsedIdentifiers(expression).flatMap((i) =>
          getVar(i)
        );

        let nextParents = [];
        for (const [i, part] of ifStatement.children.statement.entries()) {
          const statements = extractStatements(part);
          parents = [
            {
              text: i == 0 ? "true" : "false",
              id: currentId,
            },
          ];
          // console.log(statements);
          processStatements(statements);
          nextParents = nextParents.concat(parents);
        }
        if (ifStatement.children.statement.length < 2) {
          nextParents.push({
            text: "false",
            id: currentId,
          });
        }
        parents = nextParents;
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
          processStatements(statements);

          if (basicForStatement.children.forUpdate) {
            const forUpdate = basicForStatement.children.forUpdate[0];
            const forUpdateId = getId();
            const dataParents = findUsedIdentifiers(forUpdate).flatMap((e) =>
              getVar(e)
            );
            nodes.push({
              id: forUpdateId,
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
        setVar(assignment.children.unaryExpression[0].children.primary[0].children.primaryPrefix[0].children.fqnOrRefType[0].children.fqnOrRefTypePartFirst[0].children.fqnOrRefTypePartCommon[0].children.Identifier[0].image,
          [{
            id: currentId
          }]
        )
      } else {
        // Simple statement
      }
    }
    variableStack.pop();
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
