import type {
  RouterElement,
  UseElement,
  GetRouteElement,
  PutRouteElement,
  PostRouteElement,
  DeleteRouteElement,
  GlobalAttributes,
  PatchRouteElement,
  RouterElementProps,
  UseElementProps,
  GetRouteElementProps,
  PutRouteElementProps,
  PostRouteElementProps,
  DeleteRouteElementProps,
  PatchRouteElementProps,
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
      router: RouterElementProps;
      use: UseElementProps;
      get: GetRouteElementProps;
      put: PutRouteElementProps;
      post: PostRouteElementProps;
      delete: DeleteRouteElementProps;
      patch: PatchRouteElementProps;
    }
    // type IntrinsicAttributes = GlobalAttributes;
  }
}
