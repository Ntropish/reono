export function createNodeApp() {
  return {
    serve(_element: Element) {
      // no-op renderer stub
    },
    listen(_port: number, _cb?: () => void) {
      // no-op server stub
    },
  };
}
