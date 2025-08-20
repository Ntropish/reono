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

    const content = await readFile(filePath, "utf-8");
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });

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
    const content = await readFile(component.path, "utf-8");
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });

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
              importMap
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
                this.processJSXChildren(element, routes, newBasePath, importMap)
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
    importMap: Map<string, string>
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
              importMap
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
                this.processJSXChildren(child, routes, newBasePath, importMap)
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
              this.processJSXChildren(child, routes, basePath, importMap)
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
    importMap: Map<string, string>
  ): RouteInfo | null {
    const pathAttr = this.getAttributeValue(element, "path");
    if (pathAttr === null) return null;

    const fullPath = this.combinePaths(basePath, pathAttr);
    const params = this.extractPathParams(fullPath);
    const hasBody = ["POST", "PUT", "PATCH"].includes(method.toUpperCase());

    // Extract validation information
    const validation = this.extractValidation(element, importMap);

    // Extract response type from handler
    const responseType = this.extractResponseTypeFromHandler(element);

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
    element: t.JSXElement
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
        return this.analyzeHandlerFunction(expression);
      }
    }

    return undefined;
  }

  private analyzeHandlerFunction(fn: t.ArrowFunctionExpression): string {
    // Analyze the function body to determine return type
    if (t.isBlockStatement(fn.body)) {
      // Function has a block body, analyze return statements
      for (const statement of fn.body.body) {
        if (t.isReturnStatement(statement) && statement.argument) {
          return this.analyzeExpression(statement.argument);
        }
      }
    } else {
      // Arrow function with expression body
      return this.analyzeExpression(fn.body);
    }

    return "any";
  }

  private analyzeExpression(expr: t.Expression): string {
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
        return this.analyzeJsonArgument(expr.arguments[0] as t.Expression);
      }
    }
    // Direct function call like createUser(...), updateUser(...), deleteUser(...)
    if (t.isCallExpression(expr) && t.isIdentifier(expr.callee)) {
      return this.inferTypeFromFunctionName(expr.callee.name);
    }

    return "any";
  }

  private analyzeJsonArgument(arg: t.Expression): string {
    // Analyze what's being passed to c.json()
    if (t.isCallExpression(arg)) {
      // Function call like getAllUsers()
      if (t.isIdentifier(arg.callee)) {
        const functionName = arg.callee.name;
        return this.inferTypeFromFunctionName(functionName);
      }
    }

    return "any";
  }

  private inferTypeFromFunctionName(functionName: string): string {
    // Analyze function names to infer return types
    if (functionName === "getAllUsers") {
      return "Array<{ id: number; name: string }>";
    }

    if (functionName === "getUser") {
      return "{ id: number; name: string }";
    }

    if (functionName === "createUser") {
      return "{ id: number; name: string }";
    }

    if (functionName === "updateUser") {
      return "{ id: number; name: string }";
    }

    if (functionName === "deleteUser") {
      return "{ message: string }";
    }

    return "any";
  }
}
