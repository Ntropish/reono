import type {
  RouterElement,
  UseElement,
  GetRouteElement,
  PutRouteElement,
  PostRouteElement,
  DeleteRouteElement,
  GlobalAttributes,
} from "./components";

export const jsx = (type: any, props: any) => ({
  type,
  props,
});
export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = () => null;

// Make intrinsic elements available to the TS language service globally
// and ensure JSX.Element resolves to a public alias
declare global {
  namespace JSX {
    // type Element = import("./index").JSXElement;
    interface ElementAttributesProperty {
      props: {};
    }
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements {
      router: RouterElement["props"];
      use: UseElement["props"];
      get: GetRouteElement["props"];
      put: PutRouteElement["props"];
      post: PostRouteElement["props"];
      delete: DeleteRouteElement["props"];
    }
    // type IntrinsicAttributes = GlobalAttributes;
  }
}
