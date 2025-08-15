import type {
  RouterElement,
  UseElement,
  GetRouteElement,
  PutRouteElement,
  PostRouteElement,
  DeleteRouteElement,
  Element as ServerJSXElement,
  GlobalAttributes,
} from "./components";

export function createElement(
  type: ServerJSXElement["type"],
  props: any,
  ...children: any[]
): ServerJSXElement {
  const flat: any[] = [];
  const stack = children.flat ? children.flat(Infinity) : children;
  for (const c of stack) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) flat.push(...c);
    else flat.push(c);
  }
  return {
    type,
    props: {
      ...(props ?? {}),
      children: flat as any,
    },
  } as ServerJSXElement;
}

// Redirect the JSX.Element type to a public alias to avoid non-portable types
export declare namespace JSX {
  export type Element = import("./index").JSXElement;
  export interface ElementAttributesProperty {
    props: {};
  }
  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {
    router: RouterElement["props"];
    use: UseElement["props"];
    get: GetRouteElement["props"];
    put: PutRouteElement["props"];
    post: PostRouteElement["props"];
    delete: DeleteRouteElement["props"];
  }

  export type IntrinsicAttributes = GlobalAttributes;
}
