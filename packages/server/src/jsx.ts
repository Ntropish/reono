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
  return {
    type,
    props: {
      ...props,
      children,
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
