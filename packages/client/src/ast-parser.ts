import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { existsSync } from "fs";

export interface RouteInfo {
  method: string;
  path: string;
  params: string[];
  hasBody: boolean;
  bodyType?: string;
  responseType?: string;
  validation?: {
    params?: string | SchemaRef;
    body?: string | SchemaRef;
    query?: string | SchemaRef;
  };
}

export interface SchemaRef {
  kind: "schemaRef";
  name: string;
  importPath: string; // absolute path to the module exporting the schema
  partial?: boolean;
}

export interface ComponentInfo {
  name: string;
  path: string;
  routes: RouteInfo[];
}

/**
 * AST-based parser for extracting routes from Reono JSX components
 */
export class ReonoASTParser {
  private components = new Map<string, ComponentInfo>();
  private processedFiles = new Set<string>();
  private astCache = new Map<string, t.File>();

  async parseServerFile(filePath: string): Promise<RouteInfo[]> {
    console.log(`[reono-client] Parsing server file: ${filePath}`);

    const routes: RouteInfo[] = [];
    const mainComponent = await this.parseComponent(filePath);

    // Extract routes from the main component and all imported components
    console.log(`[reono-client] Starting route extraction from main component`);
    await this.extractRoutesFromComponent(mainComponent, routes, "");

    console.log(
      `[reono-client] After extraction, found ${routes.length} routes`
    );
    routes.forEach((route) => {
      console.log(`  ${route.method} ${route.path}`);
    });

    return routes;
  }

  private async parseComponent(filePath: string): Promise<ComponentInfo> {
    if (this.processedFiles.has(filePath)) {
      return this.components.get(filePath)!;
    }

    this.processedFiles.add(filePath);

    const ast = await this.getAST(filePath);

    const componentInfo: ComponentInfo = {
      name: this.getComponentName(filePath),
      path: filePath,
      routes: [],
    };

    // Find imports and process them
    const imports = new Map<string, string>();

    // @ts-ignore
    traverse.default(ast, {
      ImportDeclaration: (path: any) => {
        if (path.node.source.value.startsWith(".")) {
          console.log(
            `[reono-client] Processing import from: ${path.node.source.value}`
          );
          path.node.specifiers.forEach((spec: any) => {
            let importName: string | null = null;

            // Handle named imports: import { UserRouter } from "./router"
            if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
              importName = spec.imported.name;
            }
            // Handle default imports: import UserRouter from "./router"
            else if (
              t.isImportDefaultSpecifier(spec) &&
              t.isIdentifier(spec.local)
            ) {
              importName = spec.local.name;
            }

            if (importName) {
              const importPath = this.resolveImportPath(
                path.node.source.value,
                filePath
              );
              if (importPath) {
                console.log(
                  `[reono-client] Found import: ${importName} -> ${importPath}`
                );
                imports.set(importName, importPath);
              }
            }
          });
        }
      },
    });

    // Process imported router components
    for (const [componentName, componentPath] of imports) {
      if (componentName.endsWith("Router") && existsSync(componentPath)) {
        try {
          console.log(
            `[reono-client] Parsing router component: ${componentName} from ${componentPath}`
          );
          const importedComponent = await this.parseComponent(componentPath);
          // Store component by both file path AND component name for lookup
          this.components.set(componentPath, importedComponent);
          this.components.set(componentName, importedComponent);
          console.log(
            `[reono-client] Stored component: ${componentName} with ${importedComponent.routes.length} routes`
          );
        } catch (error) {
          console.warn(
            `[reono-client] Failed to parse ${componentPath}:`,
            error
          );
        }
      }
    }

    this.components.set(filePath, componentInfo);
    return componentInfo;
  }

  private async extractRoutesFromComponent(
    component: ComponentInfo,
    routes: RouteInfo[],
    basePath: string
  ): Promise<void> {
    const ast = await this.getAST(component.path);

    // Build local import map: local name -> resolved absolute path
    const importMap = new Map<string, string>();
    // @ts-ignore
    traverse.default(ast, {
      ImportDeclaration: (path: any) => {
        const src = path.node.source.value as string;
        if (!src.startsWith(".")) return; // only local
        path.node.specifiers.forEach((spec: any) => {
          const localName = spec.local?.name as string | undefined;
          if (!localName) return;
          const resolved = this.resolveImportPath(src, component.path);
          if (resolved) importMap.set(localName, resolved);
        });
      },
    });

    // Warm ASTs for local imports we might analyze for return types
    const warmPaths = Array.from(new Set(importMap.values()));
    await Promise.all(
      warmPaths.map((p) => this.getAST(p).catch(() => undefined))
    );

    // First pass: collect all the async work we need to do
    const asyncTasks: Promise<void>[] = [];

    // @ts-ignore
    traverse.default(ast, {
      JSXElement: (path: any) => {
        const element = path.node;
        if (t.isJSXIdentifier(element.openingElement.name)) {
          const tagName = element.openingElement.name.name;

          // Handle HTTP method elements
          if (this.isHTTPMethod(tagName)) {
            const route = this.extractRouteFromElement(
              element,
              tagName,
              basePath,
              importMap,
              component.path
            );
            if (route) {
              routes.push(route);
            }
          }

          // Handle router elements
          else if (tagName === "router") {
            const routerPath = this.getAttributeValue(element, "path");
            if (routerPath) {
              const newBasePath = this.combinePaths(basePath, routerPath);

              // Process child elements recursively
              asyncTasks.push(
                this.processJSXChildren(
                  element,
                  routes,
                  newBasePath,
                  importMap,
                  component.path
                )
              );
            }
          }

          // Handle imported router components
          else if (tagName.endsWith("Router")) {
            console.log(`[reono-client] Found router component: ${tagName}`);
            const importedComponent = this.components.get(tagName);
            if (importedComponent) {
              console.log(
                `[reono-client] Processing routes from ${tagName} at ${importedComponent.path}`
              );
              // Schedule async processing instead of calling directly
              asyncTasks.push(
                this.extractRoutesFromComponent(
                  importedComponent,
                  routes,
                  basePath
                )
              );
            } else {
              console.log(
                `[reono-client] Router component ${tagName} not found in components map`
              );
              console.log(
                `[reono-client] Available components:`,
                Array.from(this.components.keys())
              );
            }
          }
        }
      },
    });

    // Wait for all async tasks to complete
    await Promise.all(asyncTasks);
  }

  private async processJSXChildren(
    element: t.JSXElement,
    routes: RouteInfo[],
    basePath: string,
    importMap: Map<string, string>,
    sourceFilePath: string
  ): Promise<void> {
    const asyncTasks: Promise<void>[] = [];

    element.children.forEach((child) => {
      if (t.isJSXElement(child)) {
        if (t.isJSXIdentifier(child.openingElement.name)) {
          const tagName = child.openingElement.name.name;
          console.log(
            `[reono-client] Processing JSX element: ${tagName} at basePath: ${basePath}`
          );

          if (this.isHTTPMethod(tagName)) {
            const route = this.extractRouteFromElement(
              child,
              tagName,
              basePath,
              importMap,
              sourceFilePath
            );
            if (route) {
              console.log(
                `[reono-client] Found HTTP route: ${route.method} ${route.path} - adding to routes array (current length: ${routes.length})`
              );
              routes.push(route);
              console.log(
                `[reono-client] Routes array now has ${routes.length} items`
              );
            }
          } else if (tagName === "router") {
            const routerPath = this.getAttributeValue(child, "path");
            if (routerPath) {
              const newBasePath = this.combinePaths(basePath, routerPath);
              console.log(
                `[reono-client] Found router with path: ${routerPath}, new basePath: ${newBasePath}`
              );
              asyncTasks.push(
                this.processJSXChildren(
                  child,
                  routes,
                  newBasePath,
                  importMap,
                  sourceFilePath
                )
              );
            }
          } else if (tagName.endsWith("Router")) {
            console.log(
              `[reono-client] Found router component in children: ${tagName}`
            );
            console.log(
              `[reono-client] Available components: ${Array.from(this.components.keys()).join(", ")}`
            );
            const importedComponent = this.components.get(tagName);
            if (importedComponent) {
              console.log(
                `[reono-client] Processing routes from child ${tagName} at ${importedComponent.path}`
              );
              asyncTasks.push(
                this.extractRoutesFromComponent(
                  importedComponent,
                  routes,
                  basePath
                )
              );
            } else {
              console.log(
                `[reono-client] Child router component ${tagName} not found`
              );
            }
          } else {
            // Process other elements recursively (like <use> elements)
            asyncTasks.push(
              this.processJSXChildren(
                child,
                routes,
                basePath,
                importMap,
                sourceFilePath
              )
            );
          }
        }
      }
    });

    // Wait for all async processing to complete
    await Promise.all(asyncTasks);
  }

  private extractRouteFromElement(
    element: t.JSXElement,
    method: string,
    basePath: string,
    importMap: Map<string, string>,
    sourceFilePath: string
  ): RouteInfo | null {
    const pathAttr = this.getAttributeValue(element, "path");
    if (pathAttr === null) return null;

    const fullPath = this.combinePaths(basePath, pathAttr);
    const params = this.extractPathParams(fullPath);
    const hasBody = ["POST", "PUT", "PATCH"].includes(method.toUpperCase());

    // Extract validation information
    const validation = this.extractValidation(element, importMap);

    // Extract response type from handler
    const responseType = this.extractResponseTypeFromHandler(
      element,
      importMap,
      sourceFilePath
    );

    return {
      method: method.toUpperCase(),
      path: fullPath,
      params,
      hasBody,
      validation,
      responseType,
    };
  }

  private extractValidation(
    element: t.JSXElement,
    importMap: Map<string, string>
  ): RouteInfo["validation"] {
    const validateAttr = element.openingElement.attributes.find(
      (attr) =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === "validate"
    );

    if (!validateAttr || !t.isJSXAttribute(validateAttr)) return undefined;

    if (t.isJSXExpressionContainer(validateAttr.value)) {
      const expression = validateAttr.value.expression;

      if (t.isObjectExpression(expression)) {
        const validation: RouteInfo["validation"] = {};

        expression.properties.forEach((prop) => {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            const key = prop.key.name;

            // Try to extract type information from validation schema
            if (key === "params" || key === "body" || key === "query") {
              // Attempt to resolve identifier refs and .partial()
              validation[key] = this.extractSchemaType(prop.value, importMap);
            }
          }
        });

        return validation;
      }
    }

    // Fallback for simple cases
    return {
      params: "Record<string, string>",
      body: "any",
    };
  }

  private extractSchemaType(
    node: t.Node,
    importMap: Map<string, string>
  ): string | SchemaRef {
    // Simplified schema type extraction
    // In production, this would be more sophisticated and handle:
    // - z.object({ id: z.string(), name: z.string() }) -> { id: string; name: string }
    // - z.string() -> string
    // - z.number() -> number
    // - etc.

    if (t.isCallExpression(node)) {
      // Handle schemaRef.partial()
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.property) &&
        node.callee.property.name === "partial"
      ) {
        const obj = node.callee.object;
        if (t.isIdentifier(obj)) {
          const imp = importMap.get(obj.name);
          if (imp) {
            return {
              kind: "schemaRef",
              name: obj.name,
              importPath: imp,
              partial: true,
            };
          }
        }
      }
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.property)
      ) {
        const method = node.callee.property.name;

        switch (method) {
          case "string":
            return "string";
          case "number":
            return "number";
          case "boolean":
            return "boolean";
          case "object":
            // For object schemas, we'd need to parse the argument
            return "Record<string, any>";
          default:
            return "any";
        }
      }
    }

    // Identifier referencing an imported schema
    if (t.isIdentifier(node)) {
      const imp = importMap.get(node.name);
      if (imp) {
        return { kind: "schemaRef", name: node.name, importPath: imp };
      }
    }

    return "any";
  }

  private getAttributeValue(
    element: t.JSXElement,
    attrName: string
  ): string | null {
    const attr = element.openingElement.attributes.find(
      (attr) =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === attrName
    );

    if (!attr || !t.isJSXAttribute(attr)) return null;

    if (t.isStringLiteral(attr.value)) {
      return attr.value.value;
    }

    return null;
  }

  private isHTTPMethod(tagName: string): boolean {
    const methods = [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "options",
      "head",
    ];
    return methods.includes(tagName.toLowerCase());
  }

  private extractPathParams(path: string): string[] {
    const params: string[] = [];
    const paramMatches = path.matchAll(/:([A-Za-z0-9_]+)/g);

    for (const match of paramMatches) {
      if (match[1]) {
        params.push(match[1]);
      }
    }

    return params;
  }

  private combinePaths(base: string, path: string): string {
    if (!base) return path.startsWith("/") ? path : `/${path}`;
    if (!path || path === "") return base;

    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;

    return `${cleanBase}${cleanPath}`;
  }

  private resolveImportPath(
    importPath: string,
    fromFile: string
  ): string | null {
    const fromDir = dirname(fromFile);
    let resolvedPath = resolve(fromDir, importPath);

    // Try different extensions
    const extensions = [".tsx", ".ts", ".jsx", ".js"];

    for (const ext of extensions) {
      const pathWithExt = resolvedPath + ext;
      if (existsSync(pathWithExt)) {
        return pathWithExt;
      }
    }

    // Try index files
    for (const ext of extensions) {
      const indexPath = resolve(resolvedPath, `index${ext}`);
      if (existsSync(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  private getComponentName(filePath: string): string {
    const parts = filePath.split(/[\\/]/);
    const fileName = parts[parts.length - 1];
    return fileName ? fileName.replace(/\.[^.]+$/, "") : "unknown";
  }

  private extractResponseTypeFromHandler(
    element: t.JSXElement,
    importMap?: Map<string, string>,
    fromFilePath?: string
  ): string | undefined {
    // Look for handler attribute
    const handlerAttr = element.openingElement.attributes.find(
      (attr) =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === "handler"
    );

    if (!handlerAttr || !t.isJSXAttribute(handlerAttr)) {
      return undefined;
    }

    // Handler should be a JSX expression containing an arrow function
    if (t.isJSXExpressionContainer(handlerAttr.value)) {
      const expression = handlerAttr.value.expression;

      if (t.isArrowFunctionExpression(expression)) {
        return this.analyzeHandlerFunction(expression, importMap, fromFilePath);
      }
    }

    return undefined;
  }

  private analyzeHandlerFunction(
    fn: t.ArrowFunctionExpression,
    importMap?: Map<string, string>,
    fromFilePath?: string
  ): string {
    // Analyze the function body to determine return type
    if (t.isBlockStatement(fn.body)) {
      // Function has a block body, analyze return statements
      for (const statement of fn.body.body) {
        if (t.isReturnStatement(statement) && statement.argument) {
          return this.analyzeExpression(
            statement.argument as t.Expression,
            importMap,
            fromFilePath
          );
        }
      }
    } else {
      // Arrow function with expression body
      return this.analyzeExpression(
        fn.body as t.Expression,
        importMap,
        fromFilePath
      );
    }

    return "any";
  }

  private analyzeExpression(
    expr: t.Expression,
    importMap?: Map<string, string>,
    fromFilePath?: string
  ): string {
    // Look for c.json() calls
    if (
      t.isCallExpression(expr) &&
      t.isMemberExpression(expr.callee) &&
      t.isIdentifier(expr.callee.object) &&
      expr.callee.object.name === "c" &&
      t.isIdentifier(expr.callee.property) &&
      expr.callee.property.name === "json"
    ) {
      if (expr.arguments.length > 0) {
        return this.analyzeJsonArgument(
          expr.arguments[0] as t.Expression,
          importMap,
          fromFilePath
        );
      }
    }
    // Awaited expressions
    if (t.isAwaitExpression(expr)) {
      return this.analyzeExpression(
        expr.argument as t.Expression,
        importMap,
        fromFilePath
      );
    }
    // Direct function call like createUser(...), updateUser(...), deleteUser(...)
    if (t.isCallExpression(expr)) {
      if (t.isIdentifier(expr.callee)) {
        return this.inferTypeFromFunctionReference(
          expr.callee.name,
          importMap,
          fromFilePath
        );
      }
      if (
        t.isMemberExpression(expr.callee) &&
        t.isIdentifier(expr.callee.property)
      ) {
        // Try to resolve member calls like repo.getUsers()
        return this.inferTypeFromFunctionReference(
          expr.callee.property.name,
          importMap,
          fromFilePath
        );
      }
    }

    // Literal object/array heuristics
    if (t.isObjectExpression(expr)) {
      return this.objectExpressionToType(expr);
    }
    if (t.isArrayExpression(expr)) {
      // If array of objects, build an array type of object literal
      const obj = expr.elements.find((e) => e && t.isObjectExpression(e));
      if (obj && t.isObjectExpression(obj)) {
        return `Array<${this.objectExpressionToType(obj)}>`;
      }
      return "Array<any>";
    }

    return "any";
  }

  private analyzeJsonArgument(
    arg: t.Expression,
    importMap?: Map<string, string>,
    fromFilePath?: string
  ): string {
    // Analyze what's being passed to c.json()
    if (t.isAwaitExpression(arg)) {
      return this.analyzeJsonArgument(
        arg.argument as t.Expression,
        importMap,
        fromFilePath
      );
    }
    if (t.isCallExpression(arg)) {
      // Function call like getAllUsers()
      if (t.isIdentifier(arg.callee)) {
        const functionName = arg.callee.name;
        return this.inferTypeFromFunctionReference(
          functionName,
          importMap,
          fromFilePath
        );
      }
      if (
        t.isMemberExpression(arg.callee) &&
        t.isIdentifier(arg.callee.property)
      ) {
        return this.inferTypeFromFunctionReference(
          arg.callee.property.name,
          importMap,
          fromFilePath
        );
      }
    }
    if (t.isObjectExpression(arg)) {
      return this.objectExpressionToType(arg);
    }
    if (t.isArrayExpression(arg)) {
      const obj = arg.elements.find((e) => e && t.isObjectExpression(e));
      if (obj && t.isObjectExpression(obj)) {
        return `Array<${this.objectExpressionToType(obj)}>`;
      }
      return "Array<any>";
    }
    return "any";
  }

  private inferTypeFromFunctionReference(
    functionName: string,
    importMap?: Map<string, string>,
    fromFilePath?: string
  ): string {
    // 1) If importMap has the function, parse that module and get return type
    const targetPath = importMap?.get(functionName);
    if (targetPath) {
      const ret = this.getExportedFunctionReturnType(targetPath, functionName);
      return ret ?? "any";
    }

    // 2) Try to resolve from the current file for local functions
    if (fromFilePath) {
      const local = this.getLocalFunctionReturnType(fromFilePath, functionName);
      if (local) return local;
    }

    return "any";
  }

  private objectExpressionToType(obj: t.ObjectExpression): string {
    const kv: string[] = [];
    obj.properties.forEach((prop) => {
      if (t.isObjectProperty(prop)) {
        const keyName = this.propertyKeyToString(prop.key);
        const valueType = this.expressionToSimpleType(
          prop.value as t.Expression
        );
        kv.push(`${keyName}: ${valueType}`);
      }
    });
    return `{ ${kv.join("; ")} }`;
  }

  private propertyKeyToString(
    key:
      | t.Expression
      | t.PrivateName
      | t.Identifier
      | t.StringLiteral
      | t.NumericLiteral
  ): string {
    if (t.isIdentifier(key)) return key.name;
    if (t.isStringLiteral(key)) return JSON.stringify(key.value);
    if (t.isNumericLiteral(key)) return JSON.stringify(key.value);
    return "[key]";
  }

  private expressionToSimpleType(expr: t.Expression): string {
    if (t.isStringLiteral(expr) || t.isTemplateLiteral(expr)) return "string";
    if (t.isNumericLiteral(expr)) return "number";
    if (t.isBooleanLiteral(expr)) return "boolean";
    if (t.isNullLiteral(expr)) return "null";
  if (t.isUpdateExpression(expr)) return "number";
    if (t.isArrayExpression(expr)) return "Array<any>";
    if (t.isObjectExpression(expr)) return this.objectExpressionToType(expr);
    return "any";
  }

  // ---- TypeScript type extraction helpers ----
  private async getAST(filePath: string): Promise<t.File> {
    const cached = this.astCache.get(filePath);
    if (cached) return cached;
    const content = await readFile(filePath, "utf-8");
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    this.astCache.set(filePath, ast);
    return ast;
  }

  private getExportedFunctionReturnType(
    filePath: string,
    fnName: string
  ): string | undefined {
    const ast = this.astCache.get(filePath);
    if (!ast) return undefined; // should be set by getAST earlier

    let result: string | undefined;
    let heuristicResult: string | undefined;
    // @ts-ignore
    traverse.default(ast, {
      ExportNamedDeclaration: (p: any) => {
        const decl = p.node.declaration;
        if (!decl) return;
        if (t.isFunctionDeclaration(decl) && decl.id?.name === fnName) {
          const rt =
            decl.returnType && t.isTSTypeAnnotation(decl.returnType)
              ? decl.returnType.typeAnnotation
              : undefined;
          if (rt) result = this.tsTypeToString(rt);
          if (!rt)
            heuristicResult = this.inferReturnTypeFromFunctionNode(decl, ast);
        }
        if (t.isVariableDeclaration(decl)) {
          decl.declarations.forEach((d) => {
            if (
              t.isVariableDeclarator(d) &&
              t.isIdentifier(d.id) &&
              d.id.name === fnName
            ) {
              // Try function expression/arrow with returnType or variable function type annotation
              if (
                t.isArrowFunctionExpression(d.init) ||
                t.isFunctionExpression(d.init)
              ) {
                const fn: any = d.init as any;
                const rt =
                  fn.returnType && t.isTSTypeAnnotation(fn.returnType)
                    ? (fn.returnType.typeAnnotation as t.TSType)
                    : undefined;
                if (rt) result = this.tsTypeToString(rt);
                if (!rt)
                  heuristicResult = this.inferReturnTypeFromFunctionNode(
                    fn,
                    ast
                  );
              }
              if (t.isIdentifier(d.id) && d.id.typeAnnotation) {
                const taNode = d.id.typeAnnotation;
                if (t.isTSTypeAnnotation(taNode)) {
                  const ta = taNode.typeAnnotation;
                  if (t.isTSFunctionType(ta)) {
                    const retAnn =
                      ta.typeAnnotation &&
                      t.isTSTypeAnnotation(ta.typeAnnotation)
                        ? ta.typeAnnotation.typeAnnotation
                        : undefined;
                    if (retAnn) result = this.tsTypeToString(retAnn);
                  }
                }
              }
            }
          });
        }
      },
      FunctionDeclaration: (p: any) => {
        if (p.node.id?.name === fnName) {
          const rt =
            p.node.returnType && t.isTSTypeAnnotation(p.node.returnType)
              ? p.node.returnType.typeAnnotation
              : undefined;
          if (rt) result = this.tsTypeToString(rt);
          if (!rt)
            heuristicResult = this.inferReturnTypeFromFunctionNode(p.node, ast);
        }
      },
      VariableDeclarator: (p: any) => {
        const d = p.node as t.VariableDeclarator;
        if (t.isIdentifier(d.id) && d.id.name === fnName) {
          // function type via const fn: () => T
          const id = d.id as t.Identifier;
          if (id.typeAnnotation && t.isTSTypeAnnotation(id.typeAnnotation)) {
            const ta = id.typeAnnotation.typeAnnotation;
            if (t.isTSFunctionType(ta)) {
              const retAnn =
                ta.typeAnnotation && t.isTSTypeAnnotation(ta.typeAnnotation)
                  ? ta.typeAnnotation.typeAnnotation
                  : undefined;
              if (retAnn) result = this.tsTypeToString(retAnn);
            }
          }
          if (
            t.isArrowFunctionExpression(d.init) ||
            t.isFunctionExpression(d.init)
          ) {
            const fn: any = d.init as any;
            const rt =
              fn.returnType && t.isTSTypeAnnotation(fn.returnType)
                ? (fn.returnType.typeAnnotation as t.TSType)
                : undefined;
            if (rt) result = this.tsTypeToString(rt);
            if (!rt)
              heuristicResult = this.inferReturnTypeFromFunctionNode(fn, ast);
          }
        }
      },
    });
    const chosen = result ?? heuristicResult;
    return chosen ? this.unwrapPromiseType(chosen) : undefined;
  }

  private getLocalFunctionReturnType(
    fromFilePath: string,
    fnName: string
  ): string | undefined {
    const ast = this.astCache.get(fromFilePath);
    if (!ast) return undefined;
    let result: string | undefined;
    // @ts-ignore
    traverse.default(ast, {
      FunctionDeclaration: (p: any) => {
        if (p.node.id?.name === fnName) {
          const rt =
            p.node.returnType && t.isTSTypeAnnotation(p.node.returnType)
              ? p.node.returnType.typeAnnotation
              : undefined;
          if (rt) result = this.tsTypeToString(rt);
        }
      },
      VariableDeclarator: (p: any) => {
        const d = p.node as t.VariableDeclarator;
        if (t.isIdentifier(d.id) && d.id.name === fnName) {
          const id = d.id as t.Identifier;
          if (id.typeAnnotation && t.isTSTypeAnnotation(id.typeAnnotation)) {
            const ta = id.typeAnnotation.typeAnnotation;
            if (t.isTSFunctionType(ta)) {
              const retAnn =
                ta.typeAnnotation && t.isTSTypeAnnotation(ta.typeAnnotation)
                  ? ta.typeAnnotation.typeAnnotation
                  : undefined;
              if (retAnn) result = this.tsTypeToString(retAnn);
            }
          }
          if (
            t.isArrowFunctionExpression(d.init) ||
            t.isFunctionExpression(d.init)
          ) {
            const fn: any = d.init as any;
            const rt =
              fn.returnType && t.isTSTypeAnnotation(fn.returnType)
                ? (fn.returnType.typeAnnotation as t.TSType)
                : undefined;
            if (rt) result = this.tsTypeToString(rt);
          }
        }
      },
    });
    return result ? this.unwrapPromiseType(result) : undefined;
  }

  private unwrapPromiseType(typeStr: string): string {
    const match = typeStr.match(/^Promise<(.+)>$/);
    return match && match[1] ? match[1] : typeStr;
  }

  private tsTypeToString(node: t.TSType): string {
    if (t.isTSStringKeyword(node)) return "string";
    if (t.isTSNumberKeyword(node)) return "number";
    if (t.isTSBooleanKeyword(node)) return "boolean";
    if (t.isTSAnyKeyword(node)) return "any";
    if (t.isTSUnknownKeyword(node)) return "unknown";
    if (t.isTSVoidKeyword(node)) return "void";
    if (t.isTSNullKeyword(node)) return "null";
    if (t.isTSNeverKeyword(node)) return "never";
    if (t.isTSArrayType(node)) {
      return `Array<${this.tsTypeToString(node.elementType)}>`;
    }
    if (t.isTSTypeReference(node)) {
      const name = this.tsEntityNameToString(node.typeName);
      if (name === "Promise" && node.typeParameters?.params?.length) {
        const p0 = node.typeParameters.params[0];
        return `Promise<${p0 ? this.tsTypeToString(p0) : "any"}>`;
      }
      if (name === "Array" && node.typeParameters?.params?.length) {
        const p0 = node.typeParameters.params[0];
        return `Array<${p0 ? this.tsTypeToString(p0) : "any"}>`;
      }
      if (node.typeParameters?.params?.length) {
        const params = node.typeParameters.params
          .map((p) => this.tsTypeToString(p))
          .join(", ");
        return `${name}<${params}>`;
      }
      return name;
    }
    if (t.isTSTypeLiteral(node)) {
      const parts: string[] = [];
      node.members.forEach((m) => {
        if (t.isTSPropertySignature(m)) {
          const key = this.tsPropertyKeyToString(m.key);
          const optional = m.optional ? "?" : "";
          const type = m.typeAnnotation
            ? this.tsTypeToString(m.typeAnnotation.typeAnnotation)
            : "any";
          parts.push(`${key}${optional}: ${type}`);
        }
      });
      return `{ ${parts.join("; ")} }`;
    }
    if (t.isTSUnionType(node)) {
      return node.types.map((tpe) => this.tsTypeToString(tpe)).join(" | ");
    }
    if (t.isTSIntersectionType(node)) {
      return node.types.map((tpe) => this.tsTypeToString(tpe)).join(" & ");
    }
    if (t.isTSParenthesizedType(node)) {
      return this.tsTypeToString(node.typeAnnotation);
    }
    if (t.isTSLiteralType(node)) {
      const lit = node.literal;
      if (t.isStringLiteral(lit)) return JSON.stringify(lit.value);
      if (t.isNumericLiteral(lit)) return String(lit.value);
      if (t.isBooleanLiteral(lit)) return String(lit.value);
      return "any";
    }
    // Fallback for complex types (indexed, mapped, conditional, etc.)
    return "any";
  }

  private tsEntityNameToString(name: t.TSEntityName): string {
    if (t.isIdentifier(name)) return name.name;
    return `${this.tsEntityNameToString(name.left)}.${this.tsEntityNameToString(name.right)}`;
  }

  private tsPropertyKeyToString(
    key: t.Expression | t.Identifier | t.StringLiteral | t.NumericLiteral
  ): string {
    if (t.isIdentifier(key)) return key.name;
    if (t.isStringLiteral(key)) return JSON.stringify(key.value);
    if (t.isNumericLiteral(key)) return JSON.stringify(key.value);
    return "[key]";
  }

  // ---- Heuristic function return type inference for untyped functions ----
  private inferReturnTypeFromFunctionNode(
    fn:
      | t.FunctionDeclaration
      | t.FunctionExpression
      | t.ArrowFunctionExpression,
    fileAst: t.File
  ): string | undefined {
    const body = fn.body && t.isBlockStatement(fn.body) ? fn.body.body : [];

    for (const stmt of body) {
      if (t.isReturnStatement(stmt) && stmt.argument) {
        const arg = stmt.argument as t.Expression;
        // Object.values(X)
        if (t.isCallExpression(arg) && t.isMemberExpression(arg.callee)) {
          const obj = arg.callee.object;
          const prop = arg.callee.property;
          if (
            t.isIdentifier(obj) &&
            obj.name === "Object" &&
            t.isIdentifier(prop) &&
            prop.name === "values" &&
            arg.arguments.length === 1 &&
            t.isIdentifier(arg.arguments[0] as t.Expression)
          ) {
            const recName = (arg.arguments[0] as t.Identifier).name;
            const valType = this.getRecordValueTypeFromIdentifier(
              recName,
              fileAst
            );
            if (valType) return `Array<${valType}>`;
          }
        }
        // users[id] -> value type from Record
        if (
          t.isMemberExpression(arg) &&
          t.isIdentifier(arg.object) &&
          arg.computed
        ) {
          const valType = this.getRecordValueTypeFromIdentifier(
            arg.object.name,
            fileAst
          );
          if (valType) return valType;
        }
        if (t.isIdentifier(arg)) {
          const inferred = this.inferIdentifierReturnType(
            arg.name,
            body,
            fileAst
          );
          if (inferred) return inferred;
        }
        if (t.isObjectExpression(arg)) {
          return this.objectExpressionToType(arg);
        }
        if (t.isArrayExpression(arg)) {
          const obj = arg.elements.find((e) => e && t.isObjectExpression(e));
          if (obj && t.isObjectExpression(obj)) {
            return `Array<${this.objectExpressionToType(obj)}>`;
          }
          return "Array<any>";
        }
      }
    }
    return undefined;
  }

  private inferIdentifierReturnType(
    name: string,
    body: t.Statement[],
    fileAst: t.File
  ): string | undefined {
  let recordBased: string | undefined;
  let objectBased: string | undefined;
  for (const stmt of body) {
      if (t.isVariableDeclaration(stmt)) {
        for (const d of stmt.declarations) {
          if (
            t.isVariableDeclarator(d) &&
            t.isIdentifier(d.id) &&
            d.id.name === name
          ) {
            const init = d.init as t.Expression | null | undefined;
            if (!init) continue;
            if (
              t.isMemberExpression(init) &&
              t.isIdentifier(init.object) &&
              init.computed
            ) {
              const valType = this.getRecordValueTypeFromIdentifier(
                init.object.name,
                fileAst
              );
        if (valType) recordBased = valType;
            }
            if (t.isObjectExpression(init)) {
        objectBased = this.objectExpressionToType(init);
            }
          }
        }
      }
      // Detect assignment like users[expr] = name; then return name
      if (
        t.isExpressionStatement(stmt) &&
        t.isAssignmentExpression(stmt.expression)
      ) {
        const asg = stmt.expression;
        if (
          t.isMemberExpression(asg.left) &&
          t.isIdentifier(asg.left.object) &&
          asg.left.computed &&
          t.isIdentifier(asg.right) &&
          asg.right.name === name
        ) {
          const valType = this.getRecordValueTypeFromIdentifier(
            asg.left.object.name,
            fileAst
          );
      if (valType) recordBased = valType;
        }
      }
    }
  return recordBased ?? objectBased;
  }

  private getRecordValueTypeFromIdentifier(
    varName: string,
    fileAst: t.File
  ): string | undefined {
    let valueType: string | undefined;
    // @ts-ignore
    traverse.default(fileAst, {
      VariableDeclarator: (p: any) => {
        const d = p.node as t.VariableDeclarator;
        if (t.isIdentifier(d.id) && d.id.name === varName) {
          const id = d.id as t.Identifier;
          if (id.typeAnnotation && t.isTSTypeAnnotation(id.typeAnnotation)) {
            const tpe = id.typeAnnotation.typeAnnotation;
            const recVal = this.extractRecordValueType(tpe);
            if (recVal) valueType = recVal;
          }
        }
      },
    });
    return valueType;
  }

  private extractRecordValueType(tpe: t.TSType): string | undefined {
    if (t.isTSTypeReference(tpe)) {
      const name = this.tsEntityNameToString(tpe.typeName);
      if (name === "Record" && tpe.typeParameters?.params?.length === 2) {
        const vType = tpe.typeParameters.params[1];
        return vType ? this.tsTypeToString(vType) : undefined;
      }
    }
    return undefined;
  }
}
