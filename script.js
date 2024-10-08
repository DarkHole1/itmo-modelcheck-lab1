import * as javaParser from "https://esm.run/java-parser";
import mermaid from "https://esm.run/mermaid";

mermaid.initialize();

const DEFAULT_CODES = [
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
  const { svg, bindFunctions } = await mermaid.render("ast", flowchartCode);
  outputEl.innerHTML = svg;
  bindFunctions?.(outputEl);
}

async function analyzeMethod(method, graphEl, outputEl, codeEl) {
  outputEl.innerText = "";
  graphEl.value = "";

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
  function processStatements(statements) {
    for (const _statement of statements) {
      if (parents.length == 0) {
        // Unreachable code
        return;
      }
      const statement = unwrapStatement(_statement);
      // console.log(statement);
      const { startOffset, endOffset } = statement.location;
      const currentId = getId();
      const node = {
        id: currentId,
        parents: parents,
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
            nodes.push({
              id: forInitId,
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
            const expressionNode = {
              id: expressionId,
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
            nodes.push({
              id: forUpdateId,
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
            nodes.push({
              id: declId,
              parents: parents,
              text: codeEl.value.slice(
                decl.location.startOffset,
                decl.location.endOffset + 1
              ),
              type: "ordinary",
            });

            parents = [
              {
                id: declId,
              },
            ];
          }
        }
      } else {
        // Simple statement
      }
    }
  }

  processStatements(statements);

  let flowchartCode = `flowchart TD\n`;

  flowchartCode += `0(START)\n`;

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
    ast.name == "statement"
  ) {
    return unwrapStatement(Object.values(ast.children)[0][0]);
  }
  return ast;
}
