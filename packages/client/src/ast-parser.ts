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
    params?: string;
    body?: string;
    query?: string;
  };
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
    await this.extractRoutesFromComponent(mainComponent, routes, "");

    console.log(`[reono-client] Found ${routes.length} routes`);
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
      ImportDeclaration: (path) => {
        if (path.node.source.value.startsWith(".")) {
          path.node.specifiers.forEach((spec) => {
            if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
              const importName = spec.imported.name;
              const importPath = this.resolveImportPath(
                path.node.source.value,
                filePath
              );
              if (importPath) {
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
          const importedComponent = await this.parseComponent(componentPath);
          this.components.set(componentName, importedComponent);
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

    // @ts-ignore
    traverse.default(ast, {
      JSXElement: (path) => {
        const element = path.node;
        if (t.isJSXIdentifier(element.openingElement.name)) {
          const tagName = element.openingElement.name.name;

          // Handle HTTP method elements
          if (this.isHTTPMethod(tagName)) {
            const route = this.extractRouteFromElement(
              element,
              tagName,
              basePath
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
              this.processJSXChildren(element, routes, newBasePath);
            }
          }

          // Handle imported router components
          else if (tagName.endsWith("Router")) {
            const importedComponent = this.components.get(tagName);
            if (importedComponent) {
              this.extractRoutesFromComponent(
                importedComponent,
                routes,
                basePath
              );
            }
          }
        }
      },
    });
  }

  private processJSXChildren(
    element: t.JSXElement,
    routes: RouteInfo[],
    basePath: string
  ): void {
    element.children.forEach((child) => {
      if (t.isJSXElement(child)) {
        if (t.isJSXIdentifier(child.openingElement.name)) {
          const tagName = child.openingElement.name.name;

          if (this.isHTTPMethod(tagName)) {
            const route = this.extractRouteFromElement(
              child,
              tagName,
              basePath
            );
            if (route) {
              routes.push(route);
            }
          } else if (tagName === "router") {
            const routerPath = this.getAttributeValue(child, "path");
            if (routerPath) {
              const newBasePath = this.combinePaths(basePath, routerPath);
              this.processJSXChildren(child, routes, newBasePath);
            }
          } else if (tagName.endsWith("Router")) {
            const importedComponent = this.components.get(tagName);
            if (importedComponent) {
              this.extractRoutesFromComponent(
                importedComponent,
                routes,
                basePath
              );
            }
          } else {
            // Process other elements recursively (like <use> elements)
            this.processJSXChildren(child, routes, basePath);
          }
        }
      }
    });
  }

  private extractRouteFromElement(
    element: t.JSXElement,
    method: string,
    basePath: string
  ): RouteInfo | null {
    const pathAttr = this.getAttributeValue(element, "path");
    if (!pathAttr) return null;

    const fullPath = this.combinePaths(basePath, pathAttr);
    const params = this.extractPathParams(fullPath);
    const hasBody = ["POST", "PUT", "PATCH"].includes(method.toUpperCase());

    // Extract validation information
    const validation = this.extractValidation(element);

    return {
      method: method.toUpperCase(),
      path: fullPath,
      params,
      hasBody,
      validation,
    };
  }

  private extractValidation(element: t.JSXElement): RouteInfo["validation"] {
    const validateAttr = element.openingElement.attributes.find(
      (attr) =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === "validate"
    );

    if (!validateAttr || !t.isJSXAttribute(validateAttr)) return undefined;

    // This is a simplified extraction - in production we'd want to
    // fully parse the validation schema to extract types
    return {
      params: "object", // placeholder
      body: "object", // placeholder
    };
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
}
