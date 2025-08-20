import { HTTPException } from "reono";

const ErrorsRouter = () => {
  return (
    <router path="errors">
      <get
        path="bad-request"
        handler={() => {
          throw HTTPException.badRequest({ detail: "Invalid input" });
        }}
      />
      <get
        path="unauthorized"
        handler={() => {
          throw HTTPException.unauthorized({
            headers: { "WWW-Authenticate": "Bearer" },
          });
        }}
      />
      <get
        path="forbidden"
        handler={() => {
          throw HTTPException.forbidden();
        }}
      />
      <get
        path="not-found"
        handler={() => {
          throw HTTPException.notFound({ detail: "Resource not found" });
        }}
      />
      <get
        path="conflict"
        handler={() => {
          throw HTTPException.conflict({ detail: "Conflict occurred" });
        }}
      />
      <get
        path="unprocessable"
        handler={() => {
          throw HTTPException.unprocessableEntity({
            detail: "Unprocessable entity",
          });
        }}
      />
      <get
        path="too-many-requests"
        handler={() => {
          throw HTTPException.tooManyRequests({
            headers: { "Retry-After": "60" },
          });
        }}
      />
      <get
        path="internal"
        handler={() => {
          throw HTTPException.internalServerError({
            message: "Internal server error",
          });
        }}
      />
      <get
        path="custom"
        handler={() => {
          const body = JSON.stringify({ code: "custom_error", info: "Extra" });
          const res = new Response(body, {
            status: 418,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "x-test": "ok",
            },
          });
          throw HTTPException.response(res);
        }}
      />
    </router>
  );
};

export default ErrorsRouter;
